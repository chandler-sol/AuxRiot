import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { logAction, requireAdmin } from '#lib/server/mod.ts';
import { refundOrder, type RefundReason } from '#lib/server/checkout.ts';
import { stripeMode } from '#lib/server/stripe.ts';

const STATUSES = ['paid', 'refunded', 'disputed', 'pending', 'all'] as const;
const REASONS: RefundReason[] = ['buyer_request', 'defect', 'copyright', 'other'];

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const env = getEnv();
	const status = (STATUSES as readonly string[]).includes(url.searchParams.get('status') ?? '') ? url.searchParams.get('status')! : 'paid';
	const where =
		status === 'all' ? '1 = 1' : status === 'disputed' ? 'o.disputed_at IS NOT NULL' : status === 'pending' ? `o.status IN ('pending', 'expired', 'failed')` : 'o.status = ?';
	const rows = await env.DB.prepare(
		`SELECT o.id, o.status, o.amount_cents, o.tax_cents, o.platform_fee_cents, o.processing_fee_cents, o.seller_net_cents, o.includes_stems,
		        o.created_at, o.paid_at, o.first_download_at, o.download_count, o.refunded_at, o.refund_reason, o.dispute_status, o.disputed_at,
		        o.buyer_legal_name, b.id AS battle_id, b.title, bu.username AS buyer, se.username AS seller
		 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id
		 JOIN users bu ON bu.id = o.buyer_id JOIN users se ON se.id = o.seller_id
		 WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`
	)
		.bind(...(['paid', 'refunded'].includes(status) ? [status] : []))
		.all<{
			id: string; status: string; amount_cents: number; tax_cents: number; platform_fee_cents: number; processing_fee_cents: number; seller_net_cents: number;
			includes_stems: number; created_at: number; paid_at: number | null; first_download_at: number | null; download_count: number; refunded_at: number | null;
			refund_reason: string | null; dispute_status: string | null; disputed_at: number | null; buyer_legal_name: string | null; battle_id: string; title: string; buyer: string; seller: string;
		}>();
	const totals = await env.DB.prepare(
		`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS gross, COALESCE(SUM(platform_fee_cents), 0) AS fees, COALESCE(SUM(seller_net_cents), 0) AS net
		 FROM orders WHERE status = 'paid'`
	).first<{ n: number; gross: number; fees: number; net: number }>();
	return { status, orders: rows.results, totals, mode: stripeMode(env) };
};

export const actions: Actions = {
	refund: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const env = getEnv();
		const f = await request.formData();
		const id = String(f.get('order_id') ?? '');
		const reason = String(f.get('reason') ?? '') as RefundReason;
		if (!REASONS.includes(reason)) return fail(400, { error: 'Pick a reason.', id });
		const o = await env.DB.prepare('SELECT first_download_at FROM orders WHERE id = ?').bind(id).first<{ first_download_at: number | null }>();
		if (!o) return fail(404, { error: 'Order not found.', id });
		// After download, the terms only allow refunds for defects, copyright removals or what the law requires.
		if (o.first_download_at && reason === 'buyer_request' && f.get('override') !== 'on') {
			return fail(400, { error: 'They already downloaded, so the sale is final. Tick the override if you still want to refund.', id });
		}
		try {
			await refundOrder(env, id, reason, { relist: f.get('relist') === 'on' && reason !== 'copyright' });
		} catch (e) {
			return fail(502, { error: e instanceof Error ? `Stripe said: ${e.message}` : 'Refund failed.', id });
		}
		await logAction(env.DB, admin, 'order.refund', 'order', id, reason);
		return { ok: 'Refunded in full. Both sides were notified.', id };
	}
};
