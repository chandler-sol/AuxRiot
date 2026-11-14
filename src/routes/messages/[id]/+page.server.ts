import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { getConversation, isBlocked, sendMessage } from '#lib/server/messages.ts';

async function ctx(locals: App.Locals, id: string, path: string) {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(path)}`);
	const db = getEnv().DB;
	const c = await getConversation(db, id, locals.user.id);
	if (!c) error(404, 'Conversation not found');
	return { db, c, me: locals.user };
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { db, c, me } = await ctx(locals, params.id, url.pathname);
	const otherId = c.buyer_id === me.id ? c.seller_id : c.buyer_id;
	const [other, listing, msgs, iBlocked, service, blockedEither] = await Promise.all([
		db.prepare('SELECT username, avatar_key, color, respect FROM users WHERE id = ?').bind(otherId).first<{ username: string; avatar_key: string | null; color: string | null; respect: number }>(),
		c.listing_id
			? db
					.prepare(`SELECT l.status, l.price_cents, l.stems_price_cents, b.title, b.id AS battle_id, b.status AS battle_status FROM listings l JOIN battles b ON b.id = l.battle_id WHERE l.id = ?`)
					.bind(c.listing_id)
					.first<{ status: string; price_cents: number | null; stems_price_cents: number | null; title: string; battle_id: string; battle_status: string }>()
			: null,
		db
			.prepare(
				`SELECT m.id, m.sender_id, m.body, m.off_platform, m.created_at FROM messages m JOIN users s ON s.id = m.sender_id
				 WHERE m.conversation_id = ? AND m.hidden = 0 AND (s.shadowbanned = 0 OR m.sender_id = ?)
				 ORDER BY m.created_at ASC LIMIT 500`
			)
			.bind(c.id, me.id)
			.all<{ id: string; sender_id: string; body: string; off_platform: number; created_at: number }>(),
		db.prepare('SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').bind(me.id, otherId).first(),
		c.service_id
			? db.prepare('SELECT id, title, category, price_from_cents, turnaround_days, revisions, status FROM services WHERE id = ?').bind(c.service_id).first<{ id: string; title: string; category: string; price_from_cents: number; turnaround_days: number; revisions: number; status: string }>()
			: null,
		isBlocked(db, me.id, otherId)
	]);
	// Opening the thread marks it read.
	await db.prepare(`UPDATE conversations SET ${c.buyer_id === me.id ? 'buyer_read_at' : 'seller_read_at'} = ? WHERE id = ?`).bind(Date.now(), c.id).run();
	return {
		id: c.id,
		role: c.buyer_id === me.id ? 'buyer' : 'seller',
		other: other ? { username: other.username, avatarKey: other.avatar_key, color: other.color, respect: other.respect } : null,
		listing: listing ? { ...listing } : null,
		service: service ? { ...service } : null,
		purchased: !!c.order_id,
		messages: msgs.results.map((m) => ({ id: m.id, mine: m.sender_id === me.id, body: m.body, offPlatform: !!m.off_platform, at: m.created_at })),
		iBlocked: !!iBlocked,
		canSend: !blockedEither,
		now: Date.now()
	};
};

export const actions: Actions = {
	send: async ({ request, locals, params, url }) => {
		const { db, c, me } = await ctx(locals, params.id, url.pathname);
		const body = String((await request.formData()).get('body') ?? '');
		const res = await sendMessage(db, c, me, body);
		if (typeof res === 'string') return fail(400, { error: res, body });
		return { sent: true, offPlatform: res.offPlatform };
	},

	block: async ({ request, locals, params, url }) => {
		const { db, c, me } = await ctx(locals, params.id, url.pathname);
		const otherId = c.buyer_id === me.id ? c.seller_id : c.buyer_id;
		const on = (await request.formData()).get('on') === '1';
		if (on) await db.prepare('INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').bind(me.id, otherId, Date.now()).run();
		else await db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').bind(me.id, otherId).run();
		return { ok: on ? "Blocked. They can't message you, and you won't see new messages from them." : 'Unblocked.' };
	},

	report: async ({ request, locals, params, url }) => {
		const { db, c, me } = await ctx(locals, params.id, url.pathname);
		const f = await request.formData();
		const messageId = String(f.get('message_id') ?? '');
		const reason = ['harassment', 'spam', 'scam', 'other'].includes(String(f.get('reason'))) ? String(f.get('reason')) : 'other';
		const m = await db.prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND sender_id != ?').bind(messageId, c.id, me.id).first();
		if (!m) return fail(404, { error: 'Message not found.' });
		await db
			.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(newId(), me.id, 'message', messageId, reason, String(f.get('details') ?? '').slice(0, 500), Date.now())
			.run();
		return { ok: 'Reported. A moderator will review this conversation.' };
	}
};
