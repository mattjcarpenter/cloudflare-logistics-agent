import { z } from 'zod';
import { tool } from 'ai';

// Loose on purpose: if the tool's inputSchema rejects, the SDK raises InvalidToolInputError and the
// model never learns which field was wrong. Accept strings here, validate strictly in code below.
export const validateAddressInputSchema = z.object({
	line1: z.string().describe('Street address line, including the street number'),
	line2: z.string().optional().describe('Apartment, suite or unit. Omit if the user did not give one'),
	city: z.string().describe('City name'),
	state: z.string().describe('US state as a 2-letter code'),
	zip: z.string().describe('5-digit zip code, or ZIP+4'),
	country: z.string().describe('Country of the address; only US is supported'),
});

const US_STATES = [
	'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
	'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
	'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

export const addressSchema = z.object({
	line1: z.string().trim().min(1, 'Required').max(100).regex(/\d/, 'Should include a street number'),
	line2: z.string().trim().max(100).optional(),
	city: z
		.string()
		.trim()
		.min(1, 'Required')
		.max(50)
		.regex(/^[A-Za-z][A-Za-z .'-]*$/, 'Should contain only letters, spaces, periods, apostrophes or hyphens'),
	state: z.string().trim().toUpperCase().pipe(z.enum(US_STATES, 'Should be a valid 2-letter US state code')),
	zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Should be 5 digits or ZIP+4 (12345-6789)'),
	country: z
		.string()
		.trim()
		.toUpperCase()
		.pipe(z.enum(['US', 'USA', 'UNITED STATES'], 'Only US addresses are supported'))
		.transform(() => 'US' as const),
});

type Address = z.infer<typeof addressSchema>;
type Result =
	| { ok: true; data: Address }
	| { ok: false; error: { code: 'INVALID_ADDRESS'; message: string; issues: { field: string; message: string }[] } };

export function checkAddress(input: z.infer<typeof validateAddressInputSchema>): Result {
	const parsed = addressSchema.safeParse(input);
	if (parsed.success) {
		return { ok: true, data: parsed.data };
	}
	return {
		ok: false,
		error: {
			code: 'INVALID_ADDRESS',
			message: 'The address has formatting problems. Tell the user which fields to fix; do not retry with guessed values.',
			issues: parsed.error.issues.map((i) => ({ field: i.path.map(String).join('.'), message: i.message })),
		},
	};
}

export const validateAddress = tool({
	description:
		'Check that a US street address is correctly formatted and return it normalized. Call this when the user gives a full street address (not just a zip code), before using the address for anything else.',
	inputSchema: validateAddressInputSchema,
	execute: async (input) => checkAddress(input),
});
