import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { logAction, requireAdmin } from '#lib/server/mod.ts';
import { blockForCopyright, refundOrder, unblockOrder, type RefundFault, type RefundReason } from '#lib/server/checkout.ts';
import { stripeMode } from '#lib/server/stripe.ts';

const STATUSES = ['paid', 'refunded', 'disputed', 'pending', 'all'] as const;
const REASONS: RefundReason[] = ['buyer_request', 'defect', 'copyright', 'copyright_block', 'other'];
const FAULTS: RefundFault[] = ['ordinary', 'auxriot', 'auxriot_restore'];

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const env = getEnv();
	const status = (STATUSES as readonly string[]).includes(url.searchParams.get('status') ?? '') ? url.searchParams.get('status')! : 'paid';
	const where =
		status === 'all' ? '1 = 1' : status === 'disputed' ? 'o.disputed_at IS NOT NULL' : status === 'pending' ? `o.status IN ('pending', 'expired', 'failed')` : 'o.status = ?';
	const rows = await env.DB.prepare(
		`SELECT o.id, o.status, o.amount_cents, o.tax_cents, o.platform_fee_cents, o.processing_fee_cents, o.seller_net_cents, o.includes_stems,
		        o.created_at, o.paid_at, o.first_download_at, o.delivered_at, o.files_available_at, o.blocked_at, o.block_deadline, o.block_note, o.refund_fault, o.download_count, o.refunded_at, o.refund_reason, o.dispute_status, o.disputed_at,
		        o.buyer_legal_name, b.id AS battle_id, b.title, bu.username AS buyer, se.username AS seller
		 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id
		 JOIN users bu ON bu.id = o.buyer_id JOIN users se ON se.id = o.seller_id
		 WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`
	)
		.bind(...(['paid', 'refunded'].includes(status) ? [status] : []))
		.all<{
			id: string; status: string; amount_cents: number; tax_cents: number; platform_fee_cents: number; processing_fee_cents: number; seller_net_cents: number;
			includes_stems: number; created_at: number; paid_at: number | null; first_download_at: number | null; delivered_at: number | null; files_available_at: number | null;
			blocked_at: number | null; block_deadline: number | null; block_note: string | null; refund_fault: string | null; download_count: number; refunded_at: number | null;
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
		const fault = String(f.get('fault') ?? 'ordinary') as RefundFault;
		if (!REASONS.includes(reason)) return fail(400, { error: 'Pick a reason.', id });
		if (!FAULTS.includes(fault)) return fail(400, { error: 'Pick who carries the cost.', id });
		const o = await env.DB.prepare('SELECT delivered_at FROM orders WHERE id = ?').bind(id).first<{ delivered_at: number | null }>();
		if (!o) return fail(404, { error: 'Order not found.', id });
		// After delivery a change of mind doesn't qualify (Store Terms §7).
		if (o.delivered_at && reason === 'buyer_request' && f.get('override') !== 'on') {
			return fail(400, { error: 'The files were delivered, so a change of mind no longer qualifies. Tick the override if the law or goodwill requires it.', id });
		}
		try {
			await refundOrder(env, id, reason, { fault });
		} catch (e) {
			return fail(502, { error: e instanceof Error ? `Stripe said: ${e.message}` : 'Refund failed.', id });
		}
		await logAction(env.DB, admin, 'order.refund', 'order', id, `${reason} · ${fault}`);
		return { ok: 'Refunded in full. Both sides were notified; the producer got an itemized notice.', id };
	},
	block: async ({ request, locals, url }) => {
		const admin = requireAdmin(locals);
		const env = getEnv();
		const f = await request.formData();
		const id = String(f.get('order_id') ?? '');
		const note = String(f.get('note') ?? '').trim();
		if (note.length < 3) return fail(400, { error: 'Note who sent the notice (and its date).', id });
		try {
			await blockForCopyright(env, id, note, { strike: f.get('strike') === 'on', origin: url.origin });
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Could not block.', id });
		}
		await logAction(env.DB, admin, 'order.block', 'order', id, note);
		return { ok: 'Files blocked. Both sides were emailed the exact refund deadline.', id };
	},
	unblock: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const env = getEnv();
		const id = String((await request.formData()).get('order_id') ?? '');
		try {
			await unblockOrder(env, id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Could not unblock.', id });
		}
		await logAction(env.DB, admin, 'order.unblock', 'order', id, '');
		return { ok: 'Access restored. The order continues.', id };
	}
};
