// Optional recording observer. It never alters requests or provider responses.
// Only allowlisted response fields are recorded: never request headers or secrets.
import { appendFileSync } from 'node:fs';
const ledger = process.env.CURIO_API_LEDGER;
if (ledger) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== 'https://api.openai.com') return originalFetch(input, init);
    const startedAt = Date.now();
    const request = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const entry = { startedAt, endpoint: url.pathname, model: request.model ?? request.session?.model, schemaFields: Object.keys(request.response_format?.json_schema?.schema?.properties ?? {}) };
    try {
      const response = await originalFetch(input, init);
      entry.finishedAt = Date.now();
      entry.status = response.status;
      entry.requestId = response.headers.get('x-request-id');
      if (url.pathname === '/v1/chat/completions') {
        const body = await response.clone().json().catch(() => ({}));
        entry.id = body.id;
        entry.responseModel = body.model;
        entry.usage = body.usage;
        entry.finishReason = body.choices?.[0]?.finish_reason;
        entry.output = body.choices?.[0]?.message?.content;
        entry.errorCode = body.error?.code;
      }
      appendFileSync(ledger, JSON.stringify(entry) + '\n', { mode: 0o600 });
      return response;
    } catch (error) {
      appendFileSync(ledger, JSON.stringify({ ...entry, finishedAt: Date.now(), networkError: error?.name ?? 'Error' }) + '\n', { mode: 0o600 });
      throw error;
    }
  };
}
