import { createAI } from 'agents/models/ai-sdk';
import { routeAgentRequest } from 'agents';
import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat';
import { convertToModelMessages, isStepCount, pruneMessages, streamText } from 'ai';
import { getShipmentStatus } from './tools/getShipmentStatus';
import { getRateQuote } from './tools/getRateQuote';
import { validateAddress } from './tools/validateAddress';
import { createSearchPolicies } from './tools/searchPolicies';
import { z } from 'zod';

// Allowlist: only these tool args reach the logs. Addresses, zips and outputs are dropped by default.
const loggableArgs = z.object({ orderNumber: z.string() });
const toolFailure = z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) });
const neuronUsage = z.object({ neurons: z.number() });

// One JSON object per line so log tools can filter on fields like requestId
const log = (event: string, fields: Record<string, unknown>) => console.log(JSON.stringify({ event, ...fields }));

const MAX_STEPS = 3;

// One instance per conversation: a Durable Object with its own SQLite, so this.messages survives between turns
export class LogisticsAgent extends AIChatAgent<Env> {
	// Storage cap only; what the model sees is trimmed separately with pruneMessages below
	maxPersistedMessages = 50;

	async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
		const requestId = options?.requestId ?? crypto.randomUUID();
		// this.name is the instance name, i.e. the conversation id: lets you pull every turn of one chat
		const conversationId = this.name;
		const startedAt = Date.now();
		let stepNumber = 0;
		let stepStartedAt = startedAt;
		let totalNeurons = 0;
		let firstTokenMs: number | undefined;

		// Step latency mixes model and tool time, so time the network call on its own.
		// Only I/O is worth timing: Date.now() doesn't advance during pure CPU work in Workers.
		const timedSearch: Pick<AiSearchInstance, 'search'> = {
			search: async (params) => {
				const searchStartedAt = Date.now();
				// The query is model-written and could echo PII from the user, but retrieval can't be debugged without it
				const fields = { requestId, conversationId, tool: 'searchPolicies', query: params.query };
				try {
					const response = await this.env.POLICY_SEARCH.search(params);
					log('tool_io', {
						...fields,
						latencyMs: Date.now() - searchStartedAt,
						results: response.chunks.length,
						topScore: response.chunks[0]?.score,
					});
					return response;
				} catch (error) {
					log('tool_io', { ...fields, latencyMs: Date.now() - searchStartedAt, outcome: 'error' });
					throw error;
				}
			},
		};

		// Client disconnect/stop, or our own 30s budget, whichever comes first
		const signals = [AbortSignal.timeout(30_000), options?.abortSignal].filter((s) => s !== undefined);

		const ai = createAI({ binding: this.env.AI });
		const result = streamText({
			model: ai('@cf/nvidia/nemotron-3-120b-a12b'),
			system: `You are a helpful assistant that can help the users check shipment status, get shipping rate quotes, and validate US addresses. If the user gives a full street address, validate it first; for a rate quote, use the zip from the validated address. To quote a return for an existing order, look up the order and quote using its shipTo zip and weightLbs; order addresses are already validated. For policy questions (returns, carriers, shipping rules), use searchPolicies and answer only from what it returns. To decide whether an order can be returned, look up the order and search the returns policy, then apply the policy to the order's status and daysSinceDelivery; do not calculate dates yourself. Never mention tool or field names, and write dates like "Nov 19, 2026". If a required detail (order number, destination zip, weight, or an address field) is missing, ask the user for it. Never guess.`,
			tools: {
				getShipmentStatus,
				getRateQuote,
				validateAddress,
				searchPolicies: createSearchPolicies(timedSearch),
			},
			// Whole history is re-sent every turn, so drop old tool calls and reasoning to keep input tokens down
			messages: pruneMessages({
				messages: await convertToModelMessages(this.messages),
				toolCalls: 'before-last-2-messages',
				reasoning: 'before-last-message',
			}),
			maxOutputTokens: 1000,
			abortSignal: AbortSignal.any(signals),
			stopWhen: isStepCount(MAX_STEPS),
			prepareStep: ({ stepNumber }) => {
				const isLastStep = stepNumber === MAX_STEPS - 1;
				return isLastStep ? { toolChoice: 'none' } : {};
			},
			// Time to first token = when the user first sees text; ignore whitespace-only deltas
			onChunk: ({ chunk }) => {
				if (chunk.type === 'text-delta' && chunk.text.trim()) firstTokenMs ??= Date.now() - startedAt;
			},
			onStepEnd: (step) => {
				const now = Date.now();
				const neurons = neuronUsage.safeParse(step.usage.raw).data?.neurons;
				totalNeurons += neurons ?? 0;
				log('step', {
					requestId,
					conversationId,
					step: stepNumber++,
					finishReason: step.finishReason,
					latencyMs: now - stepStartedAt,
					toolCalls: step.toolCalls.map((c) => ({ tool: c.toolName, args: loggableArgs.safeParse(c.input).data })),
					toolResults: step.toolResults.map((r) => ({
						tool: r.toolName,
						outcome: toolFailure.safeParse(r.output).data?.error.code ?? 'ok',
					})),
					inputTokens: step.usage.inputTokens,
					outputTokens: step.usage.outputTokens,
					neurons,
				});
				stepStartedAt = now;
			},
			onError: ({ error }) => log('error', { requestId, conversationId, message: error instanceof Error ? error.message : String(error) }),
			onAbort: () => log('abort', { requestId, conversationId, steps: stepNumber, totalMs: Date.now() - startedAt }),
			onFinish: (event) => log('finish', {
				requestId,
				conversationId,
				historyMessages: this.messages.length,
				finishReason: event.finishReason,
				steps: stepNumber,
				firstTokenMs,
				totalMs: Date.now() - startedAt,
				totalNeurons,
			}),
		});

		// UI message stream: text plus tool-call parts; AIChatAgent persists it and sends it to the client over the WebSocket
		return result.toUIMessageStreamResponse();
	}
}

export default {
	async fetch(request: Request, env: Env) {
		// Handles /agents/<agent-name>/<instance-name> (HTTP and the WebSocket upgrade); everything else is the static UI
		return (await routeAgentRequest(request, env)) ?? new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
