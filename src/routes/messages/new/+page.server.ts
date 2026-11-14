import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { openConversation, openServiceConversation, sendMessage } from '#lib/server/messages.ts';
import { categoryOf } from '#lib/services.ts';
import { money } from '#lib/store.ts';

/** "Ask the producer": first private message about a beat for sale. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const listingId = url.searchParams.get('listing') ?? '';
	const serviceId = url.searchParams.get('service') ?? '';
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const db = getEnv().DB;
	if (serviceId) {
		const sv = await db
			.prepare(`SELECT s.id, s.user_id, s.status, s.title, s.category, s.price_from_cents, u.username FROM services s JOIN users u ON u.id = s.user_id WHERE s.id = ?`)
			.bind(serviceId)
			.first<{ id: string; user_id: string; status: string; title: string; category: string; price_from_cents: number; username: string }>();
		if (!sv || sv.status !== 'active') error(404, 'Service not found');
		if (sv.user_id === locals.user.id) redirect(303, `/settings/services/${sv.id}`);
		const ex = await db.prepare('SELECT id FROM conversations WHERE service_id = ? AND buyer_id = ?').bind(sv.id, locals.user.id).first<{ id: string }>();
		if (ex) redirect(303, `/messages/${ex.id}`);
		return {
			kind: 'service' as const,
			listing: null,
			service: { id: sv.id, title: sv.title, category: categoryOf(sv.category)?.label ?? sv.category, producer: sv.username, price: money(sv.price_from_cents) },
			verified: locals.user.emailVerified
		};
	}
	const l = await db
		.prepare(
			`SELECT l.id, l.seller_id, l.status, l.price_cents, b.title, b.id AS battle_id, u.username
			 FROM listings l JOIN battles b ON b.id = l.battle_id JOIN users u ON u.id = l.seller_id WHERE l.id = ?`
		)
		.bind(listingId)
		.first<{ id: string; seller_id: string; status: string; price_cents: number | null; title: string; battle_id: string; username: string }>();
	if (!l || l.status === 'removed') error(404, 'Beat not found');
	if (l.seller_id === locals.user.id) redirect(303, `/battles/${l.battle_id}`);
	const existing = await db.prepare('SELECT id FROM conversations WHERE listing_id = ? AND buyer_id = ?').bind(l.id, locals.user.id).first<{ id: string }>();
	if (existing) redirect(303, `/messages/${existing.id}`);
	return { kind: 'listing' as const, listing: { id: l.id, title: l.title, battleId: l.battle_id, producer: l.username, price: money(l.price_cents) }, service: null, verified: locals.user.emailVerified };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
		const db = getEnv().DB;
		const body = String((await request.formData()).get('body') ?? '');
		if (!body.trim()) return fail(400, { error: 'Write a message first.', body });
		const serviceId = url.searchParams.get('service');
		const c = serviceId ? await openServiceConversation(db, serviceId, locals.user) : await openConversation(db, url.searchParams.get('listing') ?? '', locals.user);
		if (typeof c === 'string') return fail(400, { error: c, body });
		const sent = await sendMessage(db, c, locals.user, body);
		if (typeof sent === 'string') return fail(400, { error: sent, body });
		redirect(303, `/messages/${c.id}`);
	}
};
