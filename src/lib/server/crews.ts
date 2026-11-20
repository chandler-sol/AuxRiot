import type { Cookies } from '@sveltejs/kit';
import { notify, plural } from './notifications.ts';

/**
 * Crews: a verified creator shares auxriot.com/with/<name>; anyone who signs up
 * through it reps that creator's crew (a tag next to their name). Existing users
 * can join or leave a crew from the creator's profile. One crew at a time.
 */
export const CREW_COOKIE = 'crew';
const CREW_TTL = 30 * 86_400;

export async function verifiedCreator(db: D1Database, username: string) {
	return db
		.prepare('SELECT id, username, verified_label FROM users WHERE username = ? AND verified_label IS NOT NULL AND suspended_at IS NULL')
		.bind(username)
		.first<{ id: string; username: string; verified_label: string }>();
}

export function rememberCrew(cookies: Cookies, creatorId: string, secure: boolean) {
	cookies.set(CREW_COOKIE, creatorId, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: CREW_TTL });
}

/** The crew a visitor arrived with, if that creator is still verified. */
export async function crewFromCookie(db: D1Database, cookies: Cookies) {
	const id = cookies.get(CREW_COOKIE);
	if (!id) return null;
	return db.prepare('SELECT id, username, verified_label FROM users WHERE id = ? AND verified_label IS NOT NULL').bind(id).first<{ id: string; username: string; verified_label: string }>();
}

/** On signup: join the crew from the link they came through. */
export async function applyCrewOnSignup(db: D1Database, cookies: Cookies, userId: string) {
	const crew = await crewFromCookie(db, cookies);
	if (!crew || crew.id === userId) return;
	await setCrew(db, userId, crew.id);
	cookies.delete(CREW_COOKIE, { path: '/' });
}

export async function setCrew(db: D1Database, userId: string, creatorId: string | null) {
	const before = await db.prepare('SELECT crew_id, username FROM users WHERE id = ?').bind(userId).first<{ crew_id: string | null; username: string }>();
	await db.prepare('UPDATE users SET crew_id = ?, crew_joined_at = ? WHERE id = ?').bind(creatorId, creatorId ? Date.now() : null, userId).run();
	if (creatorId && before && before.crew_id !== creatorId) {
		const creator = await db.prepare('SELECT username FROM users WHERE id = ?').bind(creatorId).first<{ username: string }>();
		await notify(db, {
			userId: creatorId,
			kind: 'crew_join',
			actorId: userId,
			group: `crew:${creatorId}`,
			text: (n) => (n === 1 ? `@${before.username} joined your crew.` : `${plural(n, 'new member')} joined your crew.`),
			url: `/u/${creator?.username ?? ''}#crew`
		});
	}
}

/** SQL bits for showing badges: select these after joining users AS u. */
export const BADGE_SELECT = `u.verified_label, (SELECT cu.username FROM users cu WHERE cu.id = u.crew_id AND cu.verified_label IS NOT NULL) AS crew`;
