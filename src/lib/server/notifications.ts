import { newId } from './util.ts';

/**
 * In-app notifications (the bell). Every event writes its own text and link,
 * so the list reads fine later. Events with a `group` merge while unread:
 * "3 new comments on …" instead of three rows.
 *
 * Kinds (keep in sync with ICONS in /notifications):
 *   battles:  battle_answered, battle_result, battle_expired, battle_waiting, battle_removed, result_reversed
 *   overtime: ot_offered, ot_opponent_dropped, ot_vote_open
 *   judging:  judge_credits, ballot_reminder
 *   social:   mention, battle_comment, respect_tier, crew_join, verified
 *   store:    beat_sold, purchase, listing_question, question_answered, order_refunded, payouts_status
 *   credits:  credits_granted
 *   safety:   report_actioned
 */
export type NotifyInput = {
	userId: string;
	kind: string;
	/** Plain text. For grouped events, a function of the running count. */
	text: string | ((count: number) => string);
	url: string;
	actorId?: string | null;
	group?: string;
};

const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export { s as plural };

export async function notify(db: D1Database, n: NotifyInput) {
	if (n.actorId && n.actorId === n.userId) return; // never notify people about their own actions
	if (n.actorId) {
		const blocked = await db.prepare('SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').bind(n.userId, n.actorId).first();
		if (blocked) return;
	}
	const now = Date.now();
	if (n.group) {
		const cur = await db
			.prepare('SELECT count FROM notifications WHERE user_id = ? AND group_key = ? AND read_at IS NULL')
			.bind(n.userId, n.group)
			.first<{ count: number }>();
		const count = (cur?.count ?? 0) + 1;
		const text = typeof n.text === 'function' ? n.text(count) : n.text;
		await db
			.prepare(
				`INSERT INTO notifications (id, user_id, kind, text, url, actor_id, group_key, count, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
				 ON CONFLICT (user_id, group_key) WHERE read_at IS NULL AND group_key IS NOT NULL
				 DO UPDATE SET count = count + 1, text = excluded.text, url = excluded.url, actor_id = excluded.actor_id, created_at = excluded.created_at`
			)
			.bind(newId(), n.userId, n.kind, text.slice(0, 300), n.url, n.actorId ?? null, n.group, now)
			.run();
		return;
	}
	const text = typeof n.text === 'function' ? n.text(1) : n.text;
	await db
		.prepare('INSERT INTO notifications (id, user_id, kind, text, url, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
		.bind(newId(), n.userId, n.kind, text.slice(0, 300), n.url, n.actorId ?? null, now)
		.run();
}

/** Same event for several people (each gets their own row; failures don't stop the rest). */
export async function notifyEach(db: D1Database, userIds: Iterable<string>, make: (userId: string) => Omit<NotifyInput, 'userId'> | null) {
	for (const userId of new Set(userIds)) {
		const n = make(userId);
		if (n) await notify(db, { ...n, userId }).catch((e) => console.error('[notify]', n.kind, e));
	}
}

export async function unreadNotifications(db: D1Database, userId: string) {
	const r = await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(userId).first<{ n: number }>();
	return r?.n ?? 0;
}

export type NotificationRow = { id: string; kind: string; text: string; url: string; count: number; created_at: number; read_at: number | null; actor: string | null; actor_avatar: string | null; actor_color: string | null };

export async function listNotifications(db: D1Database, userId: string, limit = 60) {
	const rows = await db
		.prepare(
			`SELECT n.id, n.kind, n.text, n.url, n.count, n.created_at, n.read_at, u.username AS actor, u.avatar_key AS actor_avatar, u.color AS actor_color
			 FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
			 WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?`
		)
		.bind(userId, limit)
		.all<NotificationRow>();
	return rows.results;
}

export async function markRead(db: D1Database, userId: string, id?: string) {
	const now = Date.now();
	if (id) await db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL').bind(now, id, userId).run();
	else await db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(now, userId).run();
}

/** Housekeeping (cron): drop read notifications after 90 days, everything after 180. */
export async function pruneNotifications(db: D1Database) {
	const day = 86_400_000;
	const now = Date.now();
	await db.prepare('DELETE FROM notifications WHERE (read_at IS NOT NULL AND created_at < ?) OR created_at < ?').bind(now - 90 * day, now - 180 * day).run();
}
