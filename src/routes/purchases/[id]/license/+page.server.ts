import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { orderLicense } from '#lib/server/licensedoc.ts';

/** The signed license for one order: visible to its buyer, its producer, and admins. */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const db = getEnv().DB;
	const who = await db.prepare('SELECT buyer_id, seller_id, status, paid_at FROM orders WHERE id = ?').bind(params.id).first<{ buyer_id: string; seller_id: string; status: string; paid_at: number | null }>();
	const u = locals.user;
	if (!who || (who.buyer_id !== u.id && who.seller_id !== u.id && !u.isAdmin)) error(404);
	if (!who.paid_at || (who.status !== 'paid' && who.status !== 'refunded')) error(404, 'This order is not paid yet.');
	const lic = await orderLicense(db, params.id);
	if (!lic) error(404);
	return { source: lic.source, refunded: who.status === 'refunded', version: lic.version, orderId: params.id };
};
