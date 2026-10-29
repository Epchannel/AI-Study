"""Verify HNQ discovery, authentication, and no generation replay offline."""

import json

import httpx
import openai
import pytest

from services.llm.providers.hnq_client import HNQClient


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [200, 403, 429])
async def test_gateway_discovers_models_and_never_replays(monkeypatch, status):
    requests = []

    def respond(request):
        requests.append(request)
        assert request.headers["authorization"] == "Bearer test-client-key"
        if request.url.path == "/v1/models":
            return httpx.Response(200, json={"data": [{"id": "exact-model-id"}]})
        assert request.url.path == "/v1/chat/completions"
        assert json.loads(request.content)["model"] == "exact-model-id"
        if status != 200:
            return httpx.Response(status, json={"error": {
                "message": "Rejected", "type": "invalid_request_error",
                "code": "model_not_allowed" if status == 403 else "rate_limit_exceeded",
            }})
        completion = {
            "id": "chat-1", "object": "chat.completion", "created": 1,
            "model": "exact-model-id", "choices": [{
                "index": 0, "finish_reason": "stop",
                "message": {"role": "assistant", "content": "connected"},
            }],
        }
        if json.loads(request.content).get("stream"):
            return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"connected"}}]}\n\ndata: [DONE]\n\n', headers={"content-type": "text/event-stream"})
        return httpx.Response(200, json=completion)

    real_client = openai.AsyncOpenAI
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        monkeypatch.setattr(openai, "AsyncOpenAI", lambda **kwargs: real_client(http_client=http, **kwargs))
        client = HNQClient("test-client-key", base_url="https://apihnq.hnquan.com/v1", name="custom")
        assert client.client.max_retries == 0
        if status == 200:
            text, _ = await client.chat("Tutor", "Hello")
            assert text == "connected"
        else:
            with pytest.raises(openai.APIStatusError):
                await client.chat("Tutor", "Hello")
        assert len([r for r in requests if r.method == "POST"]) == 1
        assert requests[0].url.path == "/v1/models"
        if status == 403:
            assert requests[-1].url.path == "/v1/models"
        await client.client.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal", [True, False])
@pytest.mark.parametrize("aggregate", [True, False])
async def test_stream_requires_real_done_marker_and_keeps_request_id(monkeypatch, terminal, aggregate):
    from services.llm.providers.hnq_client import HNQIncompleteStream
    requests = []
    def respond(request):
        requests.append(request)
        if request.url.path == "/v1/models":
            return httpx.Response(200, json={"data": [{"id": "discovered-id"}]})
        assert request.headers["authorization"] == "Bearer test-key"
        assert json.loads(request.content)["model"] == "discovered-id"
        payload = 'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"stop"}]}\n\n'
        if terminal:
            payload += 'data: [DONE]\n\n'
        return httpx.Response(200, text=payload, headers={"content-type": "text/event-stream", "X-Request-Id": "stream-test"})
    real_client = openai.AsyncOpenAI
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        monkeypatch.setattr(openai, "AsyncOpenAI", lambda **kwargs: real_client(http_client=http, **kwargs))
        client = HNQClient("test-key", base_url="https://apihnq.hnquan.com/v1", name="custom")
        parts = []
        async def consume():
            if aggregate:
                text, _ = await client.chat("Tutor", "Hi")
                parts.append(text)
            else:
                async for chunk in client.stream_chat("Tutor", "Hi"):
                    parts.append(chunk)
        if terminal:
            await consume()
        else:
            with pytest.raises(HNQIncompleteStream) as caught:
                await consume()
            assert caught.value.response.headers["x-request-id"] == "stream-test"
        assert parts == ([] if aggregate and not terminal else ["partial"])
        assert len([request for request in requests if request.method == "POST"]) == 1
        await client.client.close()
