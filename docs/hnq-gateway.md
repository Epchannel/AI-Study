# HNQ gateway

This checkout uses `https://apihnq.hnquan.com/v1` through the custom OpenAI-compatible provider (Chat Completions, including streaming and tools).

Add your client key to the private configuration; never use the Cockpit upstream key:

```dotenv
API_HNQ_KEY=your-client-key
```

Configuration locations:

- Manual backend: `apps/api/.env` (start uvicorn from `apps/api`).
- Docker Compose: `.env` at the repository root.
- Windows native: `native-data/settings.env`, created during native setup.

Restart the backend after editing the file. Keys and these configuration files are ignored by Git. `CUSTOM_LLM_API_KEY`, if present, takes precedence over `API_HNQ_KEY`.

Keep `LLM_PROVIDER=custom` and `CUSTOM_LLM_BASE_URL=https://apihnq.hnquan.com/v1`. Leave `CUSTOM_LLM_MODEL` blank to choose the first model returned by authenticated `/v1/models`, or supply an exact ID from that endpoint. Model discovery runs during health probes and before the first generation. If a model is rejected, the inventory is refreshed for the next request without replaying the failed generation. SDK automatic retries are disabled for HNQ.

Embeddings are disabled because the gateway does not advertise that API. Generation reads allow 900 seconds; discovery uses a separate 15-second timeout. No gateway key is bundled with the project.
