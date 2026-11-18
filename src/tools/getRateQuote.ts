import { z } from 'zod';
import { tool } from 'ai';

export const getRateQuoteInputSchema = z.object({
	destinationZip: z
		.string()
		.trim()
		.regex(/^\d{5}(-\d{4})?$/)
		.describe('The destination location for the shipment, a 5 digit zip code or ZIP+4'),
	weightLbs: z.number().positive().max(150).describe('The weight of the shipment in pounds/lbs'),
});

type Service = 'ground' | 'two_day' | 'overnight';

const ORIGIN_ZIP_CODE = '30040';
const RATES = {
	ground: {
		service: 'ground',
		baseCents: 1500,
		perLbCents: 2000,
		days: 5,
	},
	two_day: {
		service: 'two_day',
		baseCents: 3000,
		perLbCents: 4000,
		days: 2,
	},
	overnight: {
		service: 'overnight',
		baseCents: 4500,
		perLbCents: 6000,
		days: 1,
	},
} satisfies Record<Service, { service: Service; baseCents: number; perLbCents: number; days: number }>;

const rateQuoteResponse = z.object({
	billableLbs: z.number().describe('The billable weight of the shipment in pounds/lbs'),
	destinationZip: z.string().describe('The destination zip code for the shipment'),
	quotes: z.array(z.object({
		service: z.enum(['ground', 'two_day', 'overnight']).describe('The service type for the rate quote'),
		amountCents: z.int().min(0).describe('The total amount for the rate quote in cents'),
		currency: z.literal('USD').describe('The currency code for the rate quote amount'),
		estimatedDays: z.int().min(1).describe('The number of days for the rate quote delivery'),
	})).describe('An array of rate quotes for different shipping services')
});

type Result =
	| { ok: true; data: z.infer<typeof rateQuoteResponse> }
	| { ok: false; error: { code: 'UNSUPPORTED_DESTINATION'; message: string } };

const zoneFor = (zip: string) => Math.abs(Number(zip[0]) - Number(ORIGIN_ZIP_CODE[0])) + 1; // 1–10
const UNSUPPORTED_ZIP_PREFIXES = ['967', '968', '995', '996', '997', '998', '999'];

export function calculateRateQuote({ destinationZip: rawZip, weightLbs }: z.infer<typeof getRateQuoteInputSchema>): Result {
	// Rates only depend on the 5-digit zip, so drop any ZIP+4 suffix
	const destinationZip = rawZip.slice(0, 5);
	if ( UNSUPPORTED_ZIP_PREFIXES.some((p) => destinationZip.startsWith(p)) ) {
		return {
			ok: false,
			error: { code: 'UNSUPPORTED_DESTINATION', message: `We don't ship to ${destinationZip}. Tell the user; do not retry.` },
		};
	}
	const zone = zoneFor(destinationZip);
	const billableLbs = Math.ceil(weightLbs);
	return {
		ok: true,
		data: {
			destinationZip,
			billableLbs,
			quotes: Object.values(RATES).map((r) => ({
				service: r.service,
				amountCents: r.baseCents + r.perLbCents * billableLbs * zone,
				currency: 'USD',
				estimatedDays: r.days,
		}))
		},
	};
}

export const getRateQuote = tool({
	description: `This tool provides the user with a rate quote for shipping, when the tool is called it returns 3 rate quotes for ground, two day, and overnight shipping. For returns, pass the customer's zip as destinationZip; the price is the same in either direction.`,
	inputSchema: getRateQuoteInputSchema,
	execute: async ({ destinationZip, weightLbs }) => calculateRateQuote({ destinationZip, weightLbs })
})
