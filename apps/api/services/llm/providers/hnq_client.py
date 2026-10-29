"""HNQ gateway: discover exact model IDs and never retry generations implicitly."""

import asyncio
import json

import httpx
import openai

from services.llm.providers.openai_client import OpenAIClient, _build_openai_user_content


class HNQIncompleteStream(ConnectionError):
    def __init__(self, response):
        super().__init__("HNQ stream ended without [DONE]")
        self.response = response


class HNQClient(OpenAIClient):
    def __init__(self, api_key: str, model: str = "", **kwargs):
        super().__init__(api_key, model, **kwargs)
        self.client = self.client.with_options(
            max_retries=0,
            timeout=httpx.Timeout(connect=10, read=900, write=30, pool=10),
        )
        self._models_loaded = False
        self._discovery_lock = asyncio.Lock()

    async def discover_model(self, force: bool = False) -> None:
        async with self._discovery_lock:
            if self._models_loaded and not force:
                return
            result = await self.client.with_options(timeout=15).models.list()
            ids = [item.id for item in result.data if item.id]
            if not ids:
                raise ValueError("HNQ returned no models available to this API key")
            if self.model not in ids:
                self.model = ids[0]
            self._models_loaded = True

    async def ping(self) -> bool:
        try:
            await self.discover_model(force=True)
            self.mark_healthy()
            return True
        except (openai.APIError, ValueError) as exc:
            self.mark_unhealthy(str(exc))
            return False

    async def chat(self, system_prompt: str, user_message: str, images: list[dict] | None = None):
        # Long structured generations must start SSE promptly through the public
        # proxy. Callers still receive one complete validated string, never partial JSON.
        self._last_usage = {}
        parts = [part async for part in self.stream_chat(system_prompt, user_message, images)]
        return "".join(parts), self._last_usage

    async def stream_chat(self, system_prompt: str, user_message: str, images: list[dict] | None = None):
        """Read raw SSE because SDK chunk iteration hides the terminal marker."""
        await self.discover_model()
        try:
            async with self.client.chat.completions.with_streaming_response.create(
                model=self.model,
                messages=[{"role": "system", "content": system_prompt},
                          {"role": "user", "content": _build_openai_user_content(user_message, images)}],
                stream=True,
            ) as response:
                data = []
                async for line in response.iter_lines():
                    if line.startswith("data:"):
                        data.append(line[5:].lstrip(" "))
                    elif not line and data:
                        payload = "\n".join(data)
                        data = []
                        if payload == "[DONE]":
                            self.mark_healthy()
                            return
                        chunk = json.loads(payload)
                        if chunk.get("error"):
                            raise HNQIncompleteStream(response.http_response)
                        if chunk.get("usage"):
                            usage = chunk["usage"]
                            self._last_usage = {"input_tokens": usage.get("prompt_tokens", 0), "output_tokens": usage.get("completion_tokens", 0)}
                        for choice in chunk.get("choices", [])[:1]:
                            content = choice.get("delta", {}).get("content")
                            if content:
                                yield content
                raise HNQIncompleteStream(response.http_response)
        except openai.APIStatusError as exc:
            self.mark_unhealthy(str(exc))
            if exc.code in {"model_not_allowed", "model_not_found"} or exc.status_code == 404:
                self._models_loaded = False
                try:
                    await self.discover_model(force=True)
                except (openai.APIError, ValueError):
                    pass
            raise
        except (openai.APIError, httpx.HTTPError, HNQIncompleteStream, ValueError) as exc:
            self.mark_unhealthy(str(exc))
            raise

    async def _create_completion(self, **kwargs):
        await self.discover_model()
        kwargs["model"] = self.model
        try:
            return await super()._create_completion(**kwargs)
        except openai.APIStatusError as exc:
            if exc.code in {"model_not_allowed", "model_not_found"} or exc.status_code == 404:
                # Refresh for the NEXT user request; do not replay a generation.
                self._models_loaded = False
                try:
                    await self.discover_model(force=True)
                except (openai.APIError, ValueError):
                    pass
            raise
