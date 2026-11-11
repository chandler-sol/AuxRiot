import { RESPECT_PER_FAN } from '../flair.ts';
import { sharedSignals } from './battles.ts';

/** Recount a comment's visible upvotes and its author's respect. */
export async function refreshComment(db: D1Database, commentId: string) {
	const c = await db.prepare('SELECT user_id FROM comments WHERE id = ?').bind(commentId).first<{ user_id: string }>();
	if (!c) return;
	await db.batch([
		db.prepare(
			`UPDATE comments SET upvotes = (
			   SELECT COUNT(*) FROM comment_votes v JOIN users u ON u.id = v.user_id
			   WHERE v.comment_id = ? AND v.counted = 1 AND u.shadowbanned = 0) WHERE id = ?`
		).bind(commentId, commentId),
		respectQuery(db, c.user_id)
	]);
}

/** Respect = upvotes on visible comments, at most RESPECT_PER_FAN from any one person. */
export function respectQuery(db: D1Database, userId: string) {
	return db
		.prepare(
			`UPDATE users SET respect = (
			   SELECT COALESCE(SUM(n), 0) FROM (
			     SELECT MIN(COUNT(*), ?) AS n
			     FROM comment_votes v JOIN comments m ON m.id = v.comment_id JOIN users u ON u.id = v.user_id
			     WHERE m.user_id = ? AND m.hidden = 0 AND m.held = 0 AND v.counted = 1 AND u.shadowbanned = 0
			     GROUP BY v.user_id)) WHERE id = ?`
		)
		.bind(RESPECT_PER_FAN, userId, userId);
}

export async function refreshRespect(db: D1Database, userId: string) {
	await respectQuery(db, userId).run();
}

/**
 * Toggle an upvote. Returns the new state, or an error. Upvotes from an account
 * on the author's device are stored (so the voter sees their click) but never count.
 */
export async function toggleUpvote(db: D1Database, voter: SessionUser, commentId: string) {
	const c = await db
		.prepare(
			`SELECT m.user_id, m.hidden, m.held, b.status FROM comments m JOIN battles b ON b.id = m.battle_id WHERE m.id = ?`
		)
		.bind(commentId)
		.first<{ user_id: string; hidden: number; held: number; status: string }>();
	if (!c || c.hidden || c.held || c.status === 'removed') return { error: 'Comment not found.' };
	if (c.user_id === voter.id) return { error: "You can't upvote yourself." };
	if (!voter.emailVerified) return { error: 'Confirm your email to upvote.' };

	const del = await db.prepare('DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?').bind(commentId, voter.id).run();
	let on = false;
	if (!del.meta.changes) {
		const linked = await sharedSignals(db, voter.id, [c.user_id, c.user_id]);
		await db
			.prepare('INSERT OR IGNORE INTO comment_votes (comment_id, user_id, counted, created_at) VALUES (?, ?, ?, ?)')
			.bind(commentId, voter.id, linked.device ? 0 : 1, Date.now())
			.run();
		on = true;
	}
	await refreshComment(db, commentId);
	return { on };
}
