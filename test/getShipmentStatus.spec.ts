import { describe, it, expect } from "vitest";
import { lookupShipment, shipmentStatusInputSchema } from "../src/tools/getShipmentStatus";
import { calculateRateQuote } from "../src/tools/getRateQuote";

describe("getShipmentStatus", () => {

	it("should return an order with a status of processing ", () => {
		const result = lookupShipment({orderNumber: 'ORD-1001'})
		expect(result).toEqual({ok: true, data: {
      	"orderNumber": "ORD-1001",
      	"status": "processing",
      	"createdAt": "2026-10-27T14:05:00Z",
      	"estimatedShipDate": "2026-10-30",
      	"weightLbs": 2,
      	"shipTo": { "line1": "742 Evergreen Ter", "city": "Springfield", "state": "IL", "zip": "62704", "country": "US" }
    	}});
		});

	describe("daysSinceDelivery", () => {
		const now = new Date('2026-11-01T00:00:00Z');

		it.each([
			// Delivered 2026-10-20T13:45Z → 11.4 days → 11 full days
			{ orderNumber: 'ORD-1003', expected: 11 },
			// Delivered 2026-08-06T11:30Z → 86.5 days → 86
			{ orderNumber: 'ORD-1006', expected: 86 },
		])("$orderNumber → $expected full days", ({ orderNumber, expected }) => {
			const result = lookupShipment({ orderNumber }, now);
			expect(result).toEqual({ ok: true, data: expect.objectContaining({ daysSinceDelivery: expected }) });
		});

		it.each(['ORD-1001', 'ORD-1002', 'ORD-1004', 'ORD-1005'])("%s is not delivered, so has no daysSinceDelivery", (orderNumber) => {
			const result = lookupShipment({ orderNumber }, now);
			expect(result.ok && 'daysSinceDelivery' in result.data).toBe(false);
		});
	});
	
	it.each([
		{orderNumber: 'ORD-1002', expectedStatus: 'shipped'},
		{orderNumber: 'ORD-1003', expectedStatus: 'delivered'},
		{orderNumber: 'ORD-1004', expectedStatus: 'exception'},
		{orderNumber: 'ORD-1005', expectedStatus: 'cancelled'},
	])("should return an order with a status of $expectedStatus", ({orderNumber, expectedStatus}) => {
		const result = lookupShipment({orderNumber})
		expect(result).toEqual({ok: true, data: expect.objectContaining({status: expectedStatus})});
	})

	it("prices a return for ORD-1003 from its shipTo zip and weight", () => {
		const order = lookupShipment({orderNumber: 'ORD-1003'});
		if (!order.ok) throw new Error('expected ORD-1003 to exist');
		const quote = calculateRateQuote({destinationZip: order.data.shipTo.zip, weightLbs: order.data.weightLbs});
		// 60613 → zone 4, 3 lbs
		expect(quote.ok && quote.data.quotes.map((q) => q.amountCents)).toEqual([25500, 51000, 76500]);
	});

	it("normailzes whitespace and case", () => {
		const result = shipmentStatusInputSchema.safeParse({orderNumber: ' ord-1002 '});
		expect(result.success).toBe(true);
		});
	
	it("rejects an order number without the ORD- prefix", () => {
		const result = shipmentStatusInputSchema.safeParse({orderNumber: '1002'})
		expect(result.success).toBe(false);
		});		
});