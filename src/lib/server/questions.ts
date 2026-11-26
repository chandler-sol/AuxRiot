import { newId } from './util.ts';
import { BADGE_SELECT } from './crews.ts';
import { getBlockedWords, matchesBlocked } from './mod.ts';
import { notify } from './notifications.ts';

/**
 * Public Q&A on beats for sale (shown on the battle and on the beat's store page).
 * Held questions (blocked words) and shadowbanned askers are only visible to the
 * asker and the producer.
 */

export type Question = {
	id: string; listing_id: string; body: string; answer: string | null; answered_at: number | null; created_at: number; held: number;
	user_id: string; username: string; avatar_key: string | null; color: string | null; respect: number; verified_label: string | null; crew: string | null;
};

export async function listQuestions(db: D1Database, listingIds: string[], viewerId: string | null) {
	if (!listingIds.length) return [] as Question[];
	const rows = await db
		.prepare(
			`SELECT q.id, q.listing_id, q.body, q.answer, q.answered_at, q.created_at, q.held, q.user_id, u.username, u.avatar_key, u.color, u.respect, ${BADGE_SELECT}
			 FROM listing_questions q JOIN users u ON u.id = q.user_id
			 WHERE q.listing_id IN (${listingIds.map(() => '?').join(',')}) AND q.hidden = 0
			   AND ((q.held = 0 AND u.shadowbanned = 0) OR q.user_id = ? OR EXISTS (SELECT 1 FROM listings l WHERE l.id = q.listing_id AND l.seller_id = ?))
			 ORDER BY q.created_at ASC LIMIT 200`
		)
		.bind(...listingIds, viewerId ?? '', viewerId ?? '')
		.all<Question>();
	return rows.results;
}

/** Ask the producer something in public. Returns an error message, or null. */
export async function askQuestion(db: D1Database, user: SessionUser, listingId: string, body: string): Promise<string | null> {
	if (!user.emailVerified) return 'Confirm your email to ask questions.';
	if (body.length < 3 || body.length > 500) return 'Questions are 3–500 characters.';
	const l = await db
		.prepare(`SELECT l.seller_id, l.status, l.battle_id, b.title FROM listings l JOIN battles b ON b.id = l.battle_id WHERE l.id = ?`)
		.bind(listingId)
		.first<{ seller_id: string; status: string; battle_id: string; title: string }>();
	if (!l || (l.status !== 'listed' && l.status !== 'sold')) return 'That beat is not for sale.';
	if (l.seller_id === user.id) return 'Answer questions instead of asking them 😄';
	const last = await db.prepare('SELECT created_at FROM listing_questions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(user.id).first<{ created_at: number }>();
	if (last && Date.now() - last.created_at < 20_000) return 'Slow down a little.';
	const held = matchesBlocked(body, await getBlockedWords(db)) ? 1 : 0;
	await db.prepare('INSERT INTO listing_questions (id, listing_id, user_id, body, held, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), listingId, user.id, body, held, Date.now()).run();
	if (!held && !user.shadowbanned) {
		await notify(db, {
			userId: l.seller_id,
			kind: 'listing_question',
			actorId: user.id,
			text: `@${user.username} asked about your beat on "${l.title}": ${body.slice(0, 90)}${body.length > 90 ? '…' : ''}`,
			url: `/store/${listingId}#qa`
		});
	}
	return null;
}

/** The producer answers in public. Returns an error message, or null. */
export async function answerQuestion(db: D1Database, user: SessionUser, questionId: string, answer: string): Promise<string | null> {
	if (answer.length < 1 || answer.length > 1000) return 'Answers are 1–1000 characters.';
	const r = await db
		.prepare(`UPDATE listing_questions SET answer = ?, answered_at = ? WHERE id = ? AND listing_id IN (SELECT id FROM listings WHERE seller_id = ?)`)
		.bind(answer, Date.now(), questionId, user.id)
		.run();
	if (!r.meta.changes) return 'Only the producer can answer.';
	const q = await db
		.prepare('SELECT q.user_id, q.listing_id, b.title FROM listing_questions q JOIN listings l ON l.id = q.listing_id JOIN battles b ON b.id = l.battle_id WHERE q.id = ?')
		.bind(questionId)
		.first<{ user_id: string; listing_id: string; title: string }>();
	if (q) await notify(db, { userId: q.user_id, kind: 'question_answered', actorId: user.id, text: `@${user.username} answered your question about "${q.title}".`, url: `/store/${q.listing_id}#qa` });
	return null;
}
