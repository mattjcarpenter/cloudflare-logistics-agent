import { z } from 'zod';
import { tool } from 'ai';

export const searchPoliciesInputSchema = z.object({
	query: z.string().trim().min(1).max(200).describe('A short search phrase describing the policy question'),
});

// Few results on purpose: every chunk is re-sent as input on each later step
const MAX_RESULTS = 3;
// Default is 0.4. Docs are one chunk each, so scores run low: a fair query scored 0.396 on the right doc.
// Picked from one query; in production, choose it from an eval set's score distribution.
export const MATCH_THRESHOLD = 0.3;

type Result =
	| { ok: true; data: { results: { source: string; text: string }[] } }
	| { ok: false; error: { code: 'NO_RESULTS' | 'SEARCH_UNAVAILABLE'; message: string } };

// Takes only the search method so tests can pass a fake without casting
export async function searchPolicyDocs(
	instance: Pick<AiSearchInstance, 'search'>,
	{ query }: z.infer<typeof searchPoliciesInputSchema>,
): Promise<Result> {
	try {
		const response = await instance.search({
			query,
			ai_search_options: { retrieval: { max_num_results: MAX_RESULTS, match_threshold: MATCH_THRESHOLD } },
		});
		if (response.chunks.length === 0) {
			return {
				ok: false,
				error: { code: 'NO_RESULTS', message: 'No policy covers this. Tell the user you do not know; do not guess.' },
			};
		}
		// Only what the model needs: the text and its source file for citing. Scores and ids would just cost tokens.
		return { ok: true, data: { results: response.chunks.map((c) => ({ source: c.item.key, text: c.text })) } };
	} catch {
		return {
			ok: false,
			error: { code: 'SEARCH_UNAVAILABLE', message: 'Policy search is unavailable. Tell the user to try again later; do not retry.' },
		};
	}
}

export const createSearchPolicies = (instance: Pick<AiSearchInstance, 'search'>) =>
	tool({
		description:
			'Search the company policy documents (returns, carriers, shipping rules). Call this for policy questions. Do not use it for order status or prices.',
		inputSchema: searchPoliciesInputSchema,
		execute: async ({ query }) => searchPolicyDocs(instance, { query }),
	});
