import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';

/**
 * Store Terms §5: each seller's monthly gross sales and count of transactions (available
 * within 10 days after month-end), and a statement that separates taxes, platform fees,
 * processing, discounts and adjustments from net proceeds.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const rows = await getEnv()
		.DB.prepare(
			`SELECT o.id, o.status, o.amount_cents, o.list_price_cents, o.discount_cents, o.tax_cents, o.platform_fee_cents, o.processing_fee_cents, o.seller_net_cents,
			        o.paid_at, o.refunded_at, o.refund_reason, o.refund_breakdown, o.includes_stems, b.title
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id
			 WHERE o.seller_id = ? AND o.paid_at IS NOT NULL ORDER BY o.paid_at DESC LIMIT 1000`
		)
		.bind(locals.user.id)
		.all<{
			id: string; status: string; amount_cents: number; list_price_cents: number; discount_cents: number; tax_cents: number; platform_fee_cents: number;
			processing_fee_cents: number; seller_net_cents: number; paid_at: number; refunded_at: number | null; refund_reason: string | null; refund_breakdown: string | null;
			includes_stems: number; title: string;
		}>();
	const ym = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' });
	type Month = { month: string; sales: number; gross: number; discounts: number; tax: number; fees: number; processing: number; net: number; refunds: number; refundAdj: number; lines: typeof lines };
	const lines = rows.results.map((o) => {
		const b = o.refund_breakdown ? (JSON.parse(o.refund_breakdown) as { sellerReturnsCents: number; processingBorneBySellerCents: number; restoredToSellerCents: number }) : null;
		return {
			id: o.id, title: o.title, stems: !!o.includes_stems, paidAt: o.paid_at, status: o.status, refundReason: o.refund_reason, refundedAt: o.refunded_at,
			price: o.list_price_cents, discount: o.discount_cents, sale: o.amount_cents, tax: o.tax_cents, fee: o.platform_fee_cents, processing: o.processing_fee_cents, net: o.seller_net_cents,
			// What the refund changed for the seller (returned net, processing they carried, anything restored).
			adjustment: o.status === 'refunded' ? -(b ? b.sellerReturnsCents + b.processingBorneBySellerCents - b.restoredToSellerCents : o.seller_net_cents) : 0
		};
	});
	const months = new Map<string, Month>();
	for (const l of lines) {
		const k = ym(l.paidAt);
		const m = months.get(k) ?? { month: k, sales: 0, gross: 0, discounts: 0, tax: 0, fees: 0, processing: 0, net: 0, refunds: 0, refundAdj: 0, lines: [] };
		m.sales += 1;
		m.gross += l.sale;
		m.discounts += l.discount;
		m.tax += l.tax;
		m.fees += l.fee;
		m.processing += l.processing;
		m.net += l.net;
		if (l.status === 'refunded') {
			m.refunds += 1;
			m.refundAdj += l.adjustment;
		}
		m.lines.push(l);
		months.set(k, m);
	}
	return { months: [...months.values()] };
};
