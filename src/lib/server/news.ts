/**
 * AuxRiot news (marketing). Opt-ins live in our database; Resend holds the
 * matching contacts in the "AuxRiot news" segment and handles unsubscribes.
 * Everything here needs RESEND_ADMIN_KEY (a full-access key); without it,
 * opt-ins are still saved and get synced once the key is added.
 */
import { FROM } from './email.ts';

const API = 'https://api.resend.com';

export const newsReady = (env: Env) => !!env.RESEND_ADMIN_KEY && !!env.NEWS_SEGMENT_ID;

async function api(env: Env, method: string, path: string, body?: unknown) {
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(API + path, {
			method,
			headers: { authorization: `Bearer ${env.RESEND_ADMIN_KEY}`, 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		if (res.status === 429 || res.status >= 500) {
			await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
			continue;
		}
		const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
		return { status: res.status, data };
	}
	return { status: 503, data: { message: 'Resend is busy, try again' } as Record<string, unknown> };
}

/**
 * Bring one user's Resend contact in line with their choice. Subscribing
 * (an explicit action by the user) also clears a previous unsubscribe.
 * Unverified emails are never added — no marketing to addresses we haven't confirmed.
 */
export async function syncNewsContact(
	env: Env,
	user: { id: string; email: string; username: string; optIn: boolean; verified: boolean }
): Promise<'synced' | 'pending' | 'skipped' | 'error'> {
	if (!newsReady(env)) return 'pending';
	const path = `/contacts/${encodeURIComponent(user.email)}`;
	if (!user.optIn || !user.verified) {
		const r = await api(env, 'PATCH', path, { unsubscribed: true });
		if (r.status !== 200 && r.status !== 404) return 'error';
		await env.DB.prepare('UPDATE users SET news_synced = 0 WHERE id = ?').bind(user.id).run();
		return user.optIn ? 'pending' : 'skipped';
	}
	let r = await api(env, 'PATCH', path, { unsubscribed: false, first_name: user.username });
	if (r.status === 404) {
		r = await api(env, 'POST', '/contacts', {
			email: user.email,
			first_name: user.username,
			unsubscribed: false,
			segments: [{ id: env.NEWS_SEGMENT_ID }]
		});
	} else if (r.status === 200) {
		r = await api(env, 'POST', `${path}/segments/${env.NEWS_SEGMENT_ID}`);
	}
	if (r.status !== 200 && r.status !== 201) return 'error';
	await env.DB.prepare('UPDATE users SET news_synced = 1 WHERE id = ?').bind(user.id).run();
	return 'synced';
}

/** If someone unsubscribed via the link in an email, reflect that in our database. */
export async function refreshFromResend(env: Env, user: { id: string; email: string }) {
	if (!newsReady(env)) return null;
	const r = await api(env, 'GET', `/contacts/${encodeURIComponent(user.email)}`);
	if (r.status !== 200) return null;
	if (r.data.unsubscribed === true) {
		await env.DB.prepare('UPDATE users SET news_opt_in = 0, news_synced = 0 WHERE id = ?').bind(user.id).run();
		return false;
	}
	return true;
}

/** Push opted-in, verified users that never made it to Resend (e.g. signed up before the key existed). */
export async function syncPending(env: Env, limit = 40) {
	if (!newsReady(env)) return { synced: 0, failed: 0, pendingKey: true };
	const rows = await env.DB.prepare(
		`SELECT id, email, username FROM users
		 WHERE news_opt_in = 1 AND news_synced = 0 AND email_verified_at IS NOT NULL AND shadowbanned = 0 LIMIT ?`
	)
		.bind(limit)
		.all<{ id: string; email: string; username: string }>();
	let synced = 0;
	let failed = 0;
	for (const u of rows.results) {
		const r = await syncNewsContact(env, { ...u, optIn: true, verified: true });
		if (r === 'synced') synced++;
		else failed++;
	}
	return { synced, failed, pendingKey: false };
}

/** Create and immediately send a broadcast to the "AuxRiot news" segment. */
export async function sendBroadcast(env: Env, msg: { name: string; subject: string; html: string; text: string }) {
	if (!newsReady(env)) return { ok: false as const, error: 'Marketing key not set up yet.' };
	const r = await api(env, 'POST', '/broadcasts', {
		segment_id: env.NEWS_SEGMENT_ID,
		from: FROM,
		subject: msg.subject,
		html: msg.html,
		text: msg.text,
		name: msg.name,
		send: true
	});
	if (r.status !== 200 && r.status !== 201) return { ok: false as const, error: String(r.data.message ?? 'Resend refused the broadcast') };
	return { ok: true as const, id: String(r.data.id) };
}

/** Resend fills these in per recipient when the broadcast goes out. */
export const UNSUBSCRIBE_PLACEHOLDER = '{{{RESEND_UNSUBSCRIBE_URL}}}';
