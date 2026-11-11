import { error } from '@sveltejs/kit';
import { newId } from './util.ts';
import { refreshComment } from './respect.ts';

/** Moderators and admins. */
export function requireMod(locals: App.Locals) {
	if (!locals.user?.isMod) error(404);
	return locals.user;
}

/** Admins only (money, settings, roles). */
export function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) error(404);
	return locals.user;
}

/** Record a moderation/admin action in the audit log. */
export async function logAction(
	db: D1Database,
	actor: { id: string },
	action: string,
	targetType: string,
	targetId = '',
	details = ''
) {
	await db
		.prepare('INSERT INTO mod_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
		.bind(newId(), actor.id, action, targetType, targetId, details.slice(0, 500), Date.now())
		.run();
}

/** Can `actor` take action against `target`? Mods can't act on mods or admins; nobody acts on admins but admins. */
export function canActOn(actor: SessionUser, target: { is_admin: number; is_mod: number }) {
	if (target.is_admin) return actor.isAdmin;
	if (target.is_mod) return actor.isAdmin;
	return actor.isMod;
}

// ---------------------------------------------------------------------------
// Blocked words (comments matching any are held for review)

export const BLOCKED_WORDS_KEY = 'blocked_words';

export async function getBlockedWords(db: D1Database): Promise<string[]> {
	const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(BLOCKED_WORDS_KEY).first<{ value: string }>();
	return (row?.value ?? '')
		.split(/[\n,]/)
		.map((w) => w.trim().toLowerCase())
		.filter(Boolean);
}

/** Whole-word, case-insensitive match; also catches simple l33t swaps and repeated letters. */
export function matchesBlocked(text: string, words: string[]): string | null {
	if (!words.length) return null;
	const norm = text
		.toLowerCase()
		.replace(/[@4]/g, 'a')
		.replace(/3/g, 'e')
		.replace(/[1!|]/g, 'i')
		.replace(/0/g, 'o')
		.replace(/[$5]/g, 's')
		.replace(/(.)\1{2,}/g, '$1$1');
	for (const w of words) {
		const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(norm)) return w;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Account actions shared by the users page, reports and battle panels.

type Target = { id: string; username: string; is_admin: number; is_mod: number };

export async function getTarget(db: D1Database, userId: string) {
	return db.prepare('SELECT id, username, is_admin, is_mod FROM users WHERE id = ?').bind(userId).first<Target>();
}

/** Suspend (hard block, logged out everywhere) or lift a suspension. Returns an error message or null. */
export async function setSuspended(db: D1Database, actor: SessionUser, userId: string, on: boolean, reason = '') {
	const t = await getTarget(db, userId);
	if (!t) return 'User not found.';
	if (t.id === actor.id) return "You can't suspend yourself.";
	if (!canActOn(actor, t)) return 'Only an admin can act on moderators and admins.';
	if (on) {
		await db.batch([
			db.prepare('UPDATE users SET suspended_at = ?, suspended_reason = ? WHERE id = ?').bind(Date.now(), reason.slice(0, 300) || null, userId),
			db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId)
		]);
	} else {
		await db.prepare('UPDATE users SET suspended_at = NULL, suspended_reason = NULL WHERE id = ?').bind(userId).run();
	}
	await logAction(db, actor, on ? 'user.suspend' : 'user.unsuspend', 'user', userId, `${t.username}${reason ? ' — ' + reason : ''}`);
	return null;
}

export async function setShadowban(db: D1Database, actor: SessionUser, userId: string, on: boolean) {
	const t = await getTarget(db, userId);
	if (!t) return 'User not found.';
	if (t.id === actor.id) return "You can't shadowban yourself.";
	if (!canActOn(actor, t)) return 'Only an admin can act on moderators and admins.';
	await db.prepare('UPDATE users SET shadowbanned = ? WHERE id = ?').bind(on ? 1 : 0, userId).run();
	// Their comment upvotes stop (or start) counting toward other people's respect.
	const upvoted = await db.prepare('SELECT comment_id FROM comment_votes WHERE user_id = ? LIMIT 500').bind(userId).all<{ comment_id: string }>();
	for (const r of upvoted.results) await refreshComment(db, r.comment_id);
	await logAction(db, actor, on ? 'user.shadowban' : 'user.unshadowban', 'user', userId, t.username);
	return null;
}

/** Admins only: make someone a moderator or take it away. */
export async function setModerator(db: D1Database, actor: SessionUser, userId: string, on: boolean) {
	if (!actor.isAdmin) return 'Only admins can change moderators.';
	const t = await getTarget(db, userId);
	if (!t) return 'User not found.';
	if (t.is_admin) return 'Admins already have every moderator tool.';
	await db.prepare('UPDATE users SET is_mod = ? WHERE id = ?').bind(on ? 1 : 0, userId).run();
	await logAction(db, actor, on ? 'user.make_mod' : 'user.remove_mod', 'user', userId, t.username);
	return null;
}
