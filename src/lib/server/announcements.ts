import type { Cookies } from '@sveltejs/kit';

/** Signed-out visitors' dismissals live in a cookie (ids, newest last, capped). */
export const DISMISSED_COOKIE = 'ann_dismissed';
const MAX_REMEMBERED = 30;

export type Announcement = { id: string; title: string; body: string; buttonLabel: string | null; buttonUrl: string | null };

const cookieIds = (cookies: Cookies) => (cookies.get(DISMISSED_COOKIE) ?? '').split('.').filter(Boolean);

/** The announcement to show this visitor right now, if any. */
export async function currentAnnouncement(db: D1Database, userId: string | null, cookies: Cookies): Promise<Announcement | null> {
	const now = Date.now();
	const rows = await db
		.prepare(
			`SELECT a.id, a.title, a.body, a.button_label, a.button_url FROM announcements a
			 WHERE a.active = 1 AND (a.starts_at IS NULL OR a.starts_at <= ?) AND (a.ends_at IS NULL OR a.ends_at > ?)
			   AND (a.audience = 'all' OR (a.audience = 'signed_in' AND ?) OR (a.audience = 'signed_out' AND NOT ?))
			   AND NOT EXISTS (SELECT 1 FROM announcement_dismissals d WHERE d.announcement_id = a.id AND d.user_id = ?)
			 ORDER BY a.created_at DESC LIMIT 5`
		)
		.bind(now, now, userId ? 1 : 0, userId ? 1 : 0, userId ?? '')
		.all<{ id: string; title: string; body: string; button_label: string | null; button_url: string | null }>();
	const seen = new Set(cookieIds(cookies));
	const a = rows.results.find((r) => !seen.has(r.id));
	return a ? { id: a.id, title: a.title, body: a.body, buttonLabel: a.button_label, buttonUrl: a.button_url } : null;
}

/** Remember a dismissal: on the account when signed in, and in the cookie either way. */
export async function dismissAnnouncement(db: D1Database, id: string, userId: string | null, cookies: Cookies, secure: boolean) {
	if (!/^[\w-]{6,40}$/.test(id)) return;
	if (userId) {
		await db.prepare('INSERT OR IGNORE INTO announcement_dismissals (announcement_id, user_id, dismissed_at) SELECT id, ?, ? FROM announcements WHERE id = ?').bind(userId, Date.now(), id).run();
	}
	const ids = [...cookieIds(cookies).filter((x) => x !== id), id].slice(-MAX_REMEMBERED);
	cookies.set(DISMISSED_COOKIE, ids.join('.'), { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 365 * 86_400 });
}
