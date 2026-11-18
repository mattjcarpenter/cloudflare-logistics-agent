import { z } from 'zod';
import { tool } from 'ai';
import shipmentData from '../data/shipments.json';
import { addressSchema } from './validateAddress';

export const shipmentStatusInputSchema = z.object({
	orderNumber: z.string().trim().toUpperCase().regex(/^ORD-\d{4}$/).describe("Order Number, format ORD-' followed by 4 digits")
});

const baseShipment = z.object({
		orderNumber: z.string(),
		createdAt: z.iso.datetime(),
		weightLbs: z.number().positive(),
		// Validated once at module load, so the model doesn't need to call validateAddress on stored orders
		shipTo: addressSchema,
	})

const baseShipmentWithTracking = baseShipment.extend({
		carrier: z.string(),
		trackingNumber: z.string(),
		shippedAt: z.iso.datetime(),
})

const processing = baseShipment.extend({
		status: z.literal('processing'),
		estimatedShipDate: z.iso.date(),
	})

const shipped = baseShipmentWithTracking.extend({
		status: z.literal('shipped'),
		estimatedDelivery: z.iso.date(),
	})

const delivered = baseShipmentWithTracking.extend({
	status: z.literal('delivered'),
	deliveredAt: z.iso.datetime(),
})

const exception = baseShipmentWithTracking.extend({
	status: z.literal('exception'),
	exceptionReason: z.string(),
})

const canceledUnion = baseShipment.extend({
	status: z.literal('cancelled'),
	cancelledAt: z.iso.datetime()
})

const shipmentStatusUnion = z.discriminatedUnion('status', [
	processing,
	shipped,
	delivered,
	exception,
	canceledUnion
])

const shipments = z.array(shipmentStatusUnion).parse(shipmentData.shipments);

type Shipment = z.infer<typeof shipmentStatusUnion>;
type DeliveryFacts = { daysSinceDelivery?: number };
type Result = | { ok: true; data: Shipment & DeliveryFacts } | { ok: false; error: {code: 'NOT_FOUND', message: string }};

const DAY_MS = 24 * 60 * 60 * 1000;

// Code does the date math (models are unreliable at it); the return window itself lives in the policy docs
function deliveryFacts(shipment: Shipment, now: Date): DeliveryFacts {
	if (shipment.status !== 'delivered') return {};
	return { daysSinceDelivery: Math.floor((now.getTime() - Date.parse(shipment.deliveredAt)) / DAY_MS) };
}

// `now` is a parameter so tests can pin the date
export function lookupShipment({ orderNumber }: z.infer<typeof shipmentStatusInputSchema>, now: Date = new Date()): Result {
		const found = shipments.find((s) => s.orderNumber === orderNumber);

		if (!found) {
			return {
				ok: false,
				error: { code: 'NOT_FOUND', message: `No shipment was found for ${orderNumber}. Ask the user to confirm the order number. Do not retry with a different order number` }
			};
		}

		return {
			ok: true,
			data: { ...found, ...deliveryFacts(found, now) }
		};
	};

export const getShipmentStatus = tool({
	description: "Retrieve the status of a shipment using its order number",
	inputSchema: shipmentStatusInputSchema,
	execute: async ({ orderNumber }) => lookupShipment({ orderNumber })
});
