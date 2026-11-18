import { describe, it, expect } from 'vitest';
import { searchPolicyDocs, searchPoliciesInputSchema, MATCH_THRESHOLD } from '../src/tools/searchPolicies';

type SearchInstance = Pick<AiSearchInstance, 'search'>;

// Fake binding: no network, no AI Search queries used
const fakeSearch = (chunks: AiSearchSearchResponse['chunks']): SearchInstance => ({
	search: async () => ({ search_query: 'q', chunks }),
});

describe('searchPolicies', () => {
	it('returns only source and text for each chunk', async () => {
		const result = await searchPolicyDocs(
			fakeSearch([{ id: 'c1', type: 'text', score: 0.63, text: 'Return within 30 days.', item: { key: 'returns-policy.md' } }]),
			{ query: 'return window' },
		);
		expect(result).toEqual({ ok: true, data: { results: [{ source: 'returns-policy.md', text: 'Return within 30 days.' }] } });
	});

	it('returns NO_RESULTS when nothing matches', async () => {
		const result = await searchPolicyDocs(fakeSearch([]), { query: 'pets' });
		expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'NO_RESULTS' }) });
	});

	it('returns SEARCH_UNAVAILABLE when the binding throws', async () => {
		const failing: SearchInstance = { search: async () => { throw new Error('network'); } };
		const result = await searchPolicyDocs(failing, { query: 'returns' });
		expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'SEARCH_UNAVAILABLE' }) });
	});

	it('passes the lowered match threshold to the binding', async () => {
		const calls: AiSearchSearchRequest[] = [];
		const recording: SearchInstance = {
			search: async (params) => {
				calls.push(params);
				return { search_query: 'q', chunks: [] };
			},
		};
		await searchPolicyDocs(recording, { query: 'return eligibility days since delivery' });
		expect(MATCH_THRESHOLD).toBeLessThan(0.396); // the real score that 0.4 dropped
		expect(calls[0]?.ai_search_options?.retrieval?.match_threshold).toBe(MATCH_THRESHOLD);
	});

	it('rejects an empty query', () => {
		expect(searchPoliciesInputSchema.safeParse({ query: '   ' }).success).toBe(false);
	});
});
