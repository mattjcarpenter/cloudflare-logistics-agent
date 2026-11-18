import { describe, it, expect } from 'vitest';
import { calculateRateQuote, getRateQuoteInputSchema } from '../src/tools/getRateQuote';

describe('getRateQuote', () => {
	it('should return a rate quote ', () => {
		const result = calculateRateQuote({ destinationZip: '30349', weightLbs: 10 });
		expect(result).toEqual({
			ok: true,
			data: {
				destinationZip: '30349',
				billableLbs: 10,
				quotes: [
					{
						service: 'ground',
						amountCents: 21500,
						currency: 'USD',
						estimatedDays: 5,
					},
					{
						service: 'two_day',
						amountCents: 43000,
						currency: 'USD',
						estimatedDays: 2,
					},
					{
						service: 'overnight',
						amountCents: 64500,
						currency: 'USD',
						estimatedDays: 1,
					},
				],
			},
		});
	});

	it('should return a rate quote with a half pound weight', () => {
		const result = calculateRateQuote({ destinationZip: '30349', weightLbs: 10.5 });
		expect(result).toEqual({
			ok: true,
			data: {
				destinationZip: '30349',
				billableLbs: 11,
				quotes: [
					{
						service: 'ground',
						amountCents: 23500,
						currency: 'USD',
						estimatedDays: 5,
					},
					{
						service: 'two_day',
						amountCents: 47000,
						currency: 'USD',
						estimatedDays: 2,
					},
					{
						service: 'overnight',
						amountCents: 70500,
						currency: 'USD',
						estimatedDays: 1,
					},
				],
			},
		});
	});

	it('should return a rate quote when the zip has leading zero', () => {
		const result = calculateRateQuote({ destinationZip: '07753', weightLbs: 10 });
		expect(result).toEqual({
			ok: true,
			data: {
				destinationZip: '07753',
				billableLbs: 10,
				quotes: [
					{
						service: 'ground',
						amountCents: 81500,
						currency: 'USD',
						estimatedDays: 5,
					},
					{
						service: 'two_day',
						amountCents: 163000,
						currency: 'USD',
						estimatedDays: 2,
					},
					{
						service: 'overnight',
						amountCents: 244500,
						currency: 'USD',
						estimatedDays: 1,
					},
				],
			},
		});
	});

	it('should accept a ZIP+4 and quote on the 5-digit zip', () => {
		expect(getRateQuoteInputSchema.safeParse({ destinationZip: '30349-1234', weightLbs: 10 }).success).toBe(true);
		expect(calculateRateQuote({ destinationZip: '30349-1234', weightLbs: 10 })).toEqual(
			calculateRateQuote({ destinationZip: '30349', weightLbs: 10 }),
		);
	});

	it('should error with unsupported zip code ', () => {
		const result = calculateRateQuote({ destinationZip: '96813', weightLbs: 10 });
		expect(result).toEqual({
			ok: false,
			error: { code: 'UNSUPPORTED_DESTINATION', message: `We don't ship to 96813. Tell the user; do not retry.` },
		});
	});

	it('should return a error when unsupported destination zip code is provided', () => {
		const result = getRateQuoteInputSchema.safeParse({ destinationZip: '0', weightLbs: 10 });
		expect(result.success).toBe(false);
	});

	it('should return a error when unsupported weight is provided', () => {
		const result = getRateQuoteInputSchema.safeParse({ destinationZip: '30349', weightLbs: 200 });
		expect(result.success).toBe(false);
	});
});
