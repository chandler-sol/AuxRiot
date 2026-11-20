import { extractMentions, MAX_MENTIONS } from '#lib/mentions.ts';
import { notify } from './notifications.ts';
import { notifyMentionEmail } from './notify.ts';

const EMAIL_EVERY_MS = 3 * 3_600_000;

/** Which of these @names are real, visible accounts (lowercase set), for linking. */
export async function knownUsernames(db: D1Database, bodies: string[]) {
	const names = [...new Set(bodies.flatMap(extractMentions))].slice(0, 200);
	if (!names.length) return [] as string[];
	const rows = await db
		.prepare(`SELECT LOWER(username) AS u FROM users WHERE LOWER(username) IN (${names.map(() => '?').join(',')}) AND suspended_at IS NULL`)
		.bind(...names)
		.all<{ u: string }>();
	return rows.results.map((r) => r.u);
}

export function tooManyMentions(body: string) {
	return extractMentions(body).length > MAX_MENTIONS;
}

/**
 * Notify everyone tagged in a new comment. Skipped entirely for held comments and
 * shadowbanned authors; nobody hears from someone they blocked; self-tags do nothing.
 * Email (if they want it) at most once per battle every 3 hours.
 */
export async function notifyMentions(
	db: D1Database,
	c: { id: string; battleId: string; battleTitle: string; body: string; held: boolean; author: SessionUser }
) {
	if (c.held || c.author.shadowbanned) return 0;
	const names = extractMentions(c.body).slice(0, MAX_MENTIONS);
	if (!names.length) return 0;
	const users = await db
		.prepare(`SELECT id, username FROM users WHERE LOWER(username) IN (${names.map(() => '?').join(',')}) AND suspended_at IS NULL`)
		.bind(...names)
		.all<{ id: string; username: string }>();
	const url = `/battles/${c.battleId}#c-${c.id}`;
	const snippet = c.body.replace(/\s+/g, ' ').slice(0, 90) + (c.body.length > 90 ? '…' : '');
	let sent = 0;
	for (const u of users.results) {
		if (u.id === c.author.id) continue;
		const blocked = await db.prepare('SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').bind(u.id, c.author.id).first();
		if (blocked) continue;
		// Email throttle: any mention notification for this battle in the last 3 hours means no new email.
		const recent = await db
			.prepare(`SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'mention' AND url LIKE ? AND created_at > ?`)
			.bind(u.id, `/battles/${c.battleId}#%`, Date.now() - EMAIL_EVERY_MS)
			.first();
		await notify(db, { userId: u.id, kind: 'mention', actorId: c.author.id, text: `@${c.author.username} tagged you on "${c.battleTitle}": ${snippet}`, url });
		if (!recent) notifyMentionEmail(db, u.id, c.author.username, c.battleTitle, snippet, url);
		sent++;
	}
	return sent;
}
