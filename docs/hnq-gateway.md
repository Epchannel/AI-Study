# HNQ gateway

This checkout uses `https://apihnq.hnquan.com/v1` through the custom OpenAI-compatible provider (Chat Completions, including streaming and tools).

Add your client key to the private configuration; never use the Cockpit upstream key:

```dotenv
LLM_PROVIDER=custom
LLM_MODEL=gpt-5.6-luna
CUSTOM_LLM_BASE_URL=https://apihnq.hnquan.com/v1
CUSTOM_LLM_MODEL=gpt-5.6-luna
API_HNQ_KEY=your-client-key
CUSTOM_LLM_API_KEY=
LLM_REQUIRED=true
EMBEDDING_MODE=skip
```

Configuration locations:

- Manual backend: `apps/api/.env` (start uvicorn from `apps/api`).
- Docker Compose: `.env` at the repository root.
- Windows native: `native-data/settings.env`, created during native setup.

Restart the backend after editing the file. Keep keys only in private configuration; verify Git ignore rules before adding a configuration file. `CUSTOM_LLM_API_KEY`, if present, takes precedence over `API_HNQ_KEY`.

Keep `LLM_PROVIDER=custom` and `CUSTOM_LLM_BASE_URL=https://apihnq.hnquan.com/v1`. Leave `CUSTOM_LLM_MODEL` blank to choose the first model returned by authenticated `/v1/models`, or supply an exact ID from that endpoint. Model discovery runs during health probes and before the first generation. If a model is rejected, the inventory is refreshed for the next request without replaying the failed generation. SDK automatic retries are disabled for HNQ.

Embeddings are disabled because the gateway does not advertise that API. Generation reads allow 900 seconds; discovery uses a separate 15-second timeout. No gateway key is bundled with the project.

## Current model and image support

The public deployment uses the explicit default `gpt-5.6-luna` in both model settings above. Keep `CUSTOM_LLM_API_KEY` empty when using `API_HNQ_KEY`; an old nonempty custom key overrides it. Never put the key in a `NEXT_PUBLIC_*` variable. Backend restart is required after changing keys or model settings.

On 2026-10-30, this model through HNQ successfully described a synthetic image containing a red square and a blue circle, including through the deployed chat UI. This confirms this gateway/model combination at that time, not every model offered by the gateway. Model inventory may change; use an exact ID available to your key. See [image-chat usage and limits](academy-guide.md#send-images-in-chat) and [production operations](guides/windows-vps-cloudflare.md).
