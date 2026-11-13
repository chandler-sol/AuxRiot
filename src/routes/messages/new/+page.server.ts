import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { openConversation, sendMessage } from '#lib/server/messages.ts';
import { money } from '#lib/store.ts';

/** "Ask the producer": first private message about a beat for sale. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const listingId = url.searchParams.get('listing') ?? '';
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const db = getEnv().DB;
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
	return { listing: { id: l.id, title: l.title, battleId: l.battle_id, producer: l.username, price: money(l.price_cents) }, verified: locals.user.emailVerified };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
		const db = getEnv().DB;
		const body = String((await request.formData()).get('body') ?? '');
		if (!body.trim()) return fail(400, { error: 'Write a message first.', body });
		const c = await openConversation(db, url.searchParams.get('listing') ?? '', locals.user);
		if (typeof c === 'string') return fail(400, { error: c, body });
		const sent = await sendMessage(db, c, locals.user, body);
		if (typeof sent === 'string') return fail(400, { error: sent, body });
		redirect(303, `/messages/${c.id}`);
	}
};
