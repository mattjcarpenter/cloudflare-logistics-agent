# Logistics Assistant: an AI agent on Cloudflare Workers

A chat assistant for a shipping and fulfillment business. It answers customer questions by calling typed tools: it looks up orders, quotes shipping rates, validates US addresses, and searches a policy knowledge base. It can also chain these to answer multi-step questions such as *"Where's ORD-1003, and how much would it cost to ship it back?"*

Built with Cloudflare Workers, Workers AI, the Agents SDK (Durable Objects) and AI Search, and runs on the free plan.

## How it works

```
React UI ──WebSocket──▶ Worker ──▶ LogisticsAgent (Durable Object, one per conversation)
                                     │  history persisted in the DO's SQLite
                                     ▼
                              streamText (Workers AI model)
                                     │  up to 3 steps
                 ┌──────────────┬────┴─────────┬──────────────────┐
         getShipmentStatus  getRateQuote  validateAddress   searchPolicies
          (sample orders)   (zone rates)   (zod rules)     (AI Search over kb/)
```

- **One Durable Object per conversation.** `AIChatAgent` stores the message history in SQLite, so refreshing the page brings the conversation back.
- **Bounded multi-step reasoning.** `stopWhen: isStepCount(3)` caps the loop, and `prepareStep` turns tools off on the last step so the model always ends with an answer instead of a dangling tool call.
- **Errors are data.** Tools return `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. The model sees the error code and a hint (for example "ask the user, don't retry") instead of an exception.
- **The LLM handles intent, code enforces invariants.** Zod validates every input from the model. Money is integer cents, billable weight is rounded up in code, and days-since-delivery is computed in code. The model applies the returns policy it retrieves from AI Search.

## Tools

| Tool | What it does |
|------|--------------|
| `getShipmentStatus` | Looks up an order (`ORD-####`) in `src/data/shipments.json`. Returns a status-specific shape (processing, shipped, delivered or exception) and `daysSinceDelivery`. |
| `getRateQuote` | Quotes ground, two-day and overnight shipping from a fixed origin warehouse, based on zone and billable weight. Rejects Alaska and Hawaii. |
| `validateAddress` | Normalizes and validates a US address. Takes loose input and validates strictly in code, so the model gets per-field `issues` it can pass on to the user. |
| `searchPolicies` | Retrieves the relevant policy text (returns, carriers, shipping FAQ) from an AI Search instance indexed over `kb/`. |

## Observability

Every step writes one structured JSON log line (`step`, `tool_io`, `finish`, `error`, `abort`) tagged with `requestId` and `conversationId`. Each line includes finish reason, latency, tool outcomes, tokens and Workers AI Neurons. The `finish` line adds time to first token and total time.

Tool arguments go through an allowlist: only the order number is logged. Addresses and tool outputs are left out to keep PII out of the logs.

## Project layout

```
src/
  index.ts        Worker entry and LogisticsAgent (model, tools, step control, logging)
  client.tsx      Minimal React chat UI (useAgent + useAgentChat)
  tools/          One file per tool: zod schemas, pure logic, tool() definition
  data/           Sample shipment records
kb/               Policy documents indexed by AI Search
test/             Vitest unit tests for each tool (no model calls)
```

## Running locally

Prerequisites: Node.js, a Cloudflare account and `npx wrangler login`.

1. Install dependencies:
   ```sh
   npm install
   ```
2. Create an AI Search instance, upload the files in `kb/` to it, and set `instance_name` under `ai_search` in `wrangler.jsonc` to your instance's name.
3. Start the dev server, which serves the React UI and the Worker together:
   ```sh
   npm run dev
   ```
4. Run the tests:
   ```sh
   npm test
   ```

Workers AI and AI Search calls go to your Cloudflare account even in local dev, so they count toward your usage.

## Try asking

- "Where's ORD-1002?"
- "How much to ship a 6 lb package to 29228?"
- "Can I return ORD-1003? How much would it cost to ship it back?"
- "What's your returns policy?"
- "Validate 123 Main St, Springfield, IL 62704"

## Deploy

```sh
npm run deploy
```
