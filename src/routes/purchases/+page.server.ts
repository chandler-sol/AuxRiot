import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { cancelBeforeDelivery, DELIVERY_DAYS, refundOrder } from '#lib/server/checkout.ts';
import { formatDeadline } from '#lib/server/bizdays.ts';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	depends('app:purchases');
	const rows = await getEnv()
		.DB.prepare(
			`SELECT o.id, o.status, o.amount_cents, o.tax_cents, o.includes_stems, o.paid_at, o.created_at, o.download_count, o.first_download_at, o.delivered_at,
			        o.files_available_at, o.blocked_at, o.block_deadline, o.refund_reason,
			        l.file_format, l.stems_key IS NOT NULL AS has_stems, b.id AS battle_id, b.title, u.username AS seller
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN users u ON u.id = o.seller_id
			 WHERE o.buyer_id = ? AND (o.status IN ('paid', 'refunded') OR o.id = ?)
			 ORDER BY o.created_at DESC LIMIT 100`
		)
		.bind(locals.user.id, url.searchParams.get('order') ?? '')
		.all<{
			id: string; status: string; amount_cents: number; tax_cents: number; includes_stems: number; paid_at: number | null; created_at: number;
			download_count: number; first_download_at: number | null; delivered_at: number | null; files_available_at: number | null; blocked_at: number | null;
			block_deadline: number | null; refund_reason: string | null; file_format: string | null; has_stems: number; battle_id: string; title: string; seller: string;
		}>();
	return {
		highlight: url.searchParams.get('order'),
		orders: rows.results.map((o) => ({
			...o,
			// Reserved (paid, not yet delivered): the 14-day window to take delivery.
			expiresAt: o.status === 'paid' && !o.delivered_at && o.files_available_at ? o.files_available_at + DELIVERY_DAYS * 86_400_000 : null,
			blockDeadline: o.block_deadline ? formatDeadline(o.block_deadline) : null
		}))
	};
};

const mine = async (id: string, userId: string) =>
	getEnv().DB.prepare('SELECT id, status, blocked_at FROM orders WHERE id = ? AND buyer_id = ?').bind(id, userId).first<{ id: string; status: string; blocked_at: number | null }>();

export const actions: Actions = {
	/** Store Terms §6: cancel before the first delivery for a full refund. */
	cancel: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const id = String((await request.formData()).get('order_id') ?? '');
		try {
			const r = await cancelBeforeDelivery(getEnv(), id, locals.user.id);
			if ('error' in r) return fail(400, { error: r.error, id });
		} catch (e) {
			console.error('[purchases] cancel', e);
			return fail(502, { error: "The refund didn't go through. Try again, or email hello@auxriot.com with your order number.", id });
		}
		return { ok: 'Canceled. Your full refund is on its way; your bank decides when it posts.', id };
	},
	/** Store Terms §7: while a copyright notice blocks the files, refund immediately on request. */
	blockRefund: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const id = String((await request.formData()).get('order_id') ?? '');
		const o = await mine(id, locals.user.id);
		if (!o || o.status !== 'paid' || !o.blocked_at) return fail(400, { error: 'This order is not blocked.', id });
		try {
			await refundOrder(getEnv(), id, 'copyright_block');
		} catch (e) {
			console.error('[purchases] block refund', e);
			return fail(502, { error: "The refund didn't go through. Try again, or email hello@auxriot.com.", id });
		}
		return { ok: 'Refund started. Your bank decides when it posts.', id };
	}
};
