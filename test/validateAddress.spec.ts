import { describe, it, expect } from 'vitest';
import { checkAddress } from '../src/tools/validateAddress';

const valid = {
	line1: '123 Peachtree St NE',
	line2: 'Suite 400',
	city: 'Atlanta',
	state: 'GA',
	zip: '30303',
	country: 'US',
};

const issueFields = (result: ReturnType<typeof checkAddress>) => (result.ok ? [] : result.error.issues.map((i) => i.field));

describe('validateAddress', () => {
	it('accepts a well-formed address', () => {
		expect(checkAddress(valid)).toEqual({ ok: true, data: valid });
	});

	it('normalizes whitespace, state case and country spelling', () => {
		const result = checkAddress({ ...valid, line1: '  123 Peachtree St NE ', state: 'ga', country: 'United States' });
		expect(result).toEqual({ ok: true, data: valid });
	});

	it('accepts a missing line2', () => {
		const withoutLine2 = { line1: valid.line1, city: valid.city, state: valid.state, zip: valid.zip, country: valid.country };
		expect(checkAddress(withoutLine2)).toEqual({ ok: true, data: withoutLine2 });
	});

	it.each(['30303-1234', '07753'])('accepts zip %s', (zip) => {
		expect(checkAddress({ ...valid, zip }).ok).toBe(true);
	});

	it.each(['3030', '303031', 'ABCDE', '30303-12'])('rejects zip %s', (zip) => {
		expect(issueFields(checkAddress({ ...valid, zip }))).toEqual(['zip']);
	});

	it('rejects an unknown state code', () => {
		expect(issueFields(checkAddress({ ...valid, state: 'ZZ' }))).toEqual(['state']);
	});

	it('rejects a non-US country', () => {
		expect(issueFields(checkAddress({ ...valid, country: 'Canada' }))).toEqual(['country']);
	});

	it('rejects line1 without a street number', () => {
		expect(issueFields(checkAddress({ ...valid, line1: 'Peachtree St' }))).toEqual(['line1']);
	});

	it('rejects a city with digits', () => {
		expect(issueFields(checkAddress({ ...valid, city: 'Atlanta 1' }))).toEqual(['city']);
	});

	it('reports every bad field at once with a recoverable error', () => {
		const result = checkAddress({ ...valid, line1: ' ', city: '', zip: 'nope' });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('INVALID_ADDRESS');
			expect(result.error.message).toContain('do not retry');
		}
		// A field can fail more than one check (empty AND no street number), so compare the set of fields
		expect([...new Set(issueFields(result))]).toEqual(['line1', 'city', 'zip']);
	});
});
