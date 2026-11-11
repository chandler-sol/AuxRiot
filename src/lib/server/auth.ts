import type { Cookies } from '@sveltejs/kit';
import { b64url, b64urlDecode, newId, sha256, DAY } from './util';

const enc = new TextEncoder();
// Workers caps PBKDF2 at 100k iterations.
const ITERATIONS = 100_000;
const SESSION_TTL = 30 * DAY;
export const SESSION_COOKIE = 'sid';
export const DEVICE_COOKIE = 'did';
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
	const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	return new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
	);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await pbkdf2(password, salt, ITERATIONS);
	return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algo, iter, salt, hash] = stored.split('$');
	if (algo !== 'pbkdf2') return false;
	const actual = await pbkdf2(password, b64urlDecode(salt), Number(iter));
	const expected = b64urlDecode(hash);
	if (actual.length !== expected.length) return false;
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
	return diff === 0;
}

export async function createSession(db: D1Database, cookies: Cookies, userId: string, secure: boolean) {
	const token = newId(24);
	const expires = Date.now() + SESSION_TTL;
	await db
		.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
		.bind(await sha256(token), userId, expires)
		.run();
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: SESSION_TTL / 1000
	});
}

export async function destroySession(db: D1Database, cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(token)).run();
	}
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function getSessionUser(
	db: D1Database,
	token: string,
	adminNames: string[]
): Promise<SessionUser | null> {
	const row = await db
		.prepare(
			`SELECT u.id, u.username, u.is_admin, u.shadowbanned, u.created_at, u.email_verified_at, u.credits, s.expires_at
			 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`
		)
		.bind(await sha256(token))
		.first<{
			id: string;
			username: string;
			is_admin: number;
			shadowbanned: number;
			created_at: number;
			email_verified_at: number | null;
			credits: number;
			expires_at: number;
		}>();
	if (!row || row.expires_at < Date.now()) return null;
	return {
		id: row.id,
		username: row.username,
		isAdmin: !!row.is_admin || adminNames.includes(row.username.toLowerCase()),
		shadowbanned: !!row.shadowbanned,
		createdAt: row.created_at,
		emailVerified: row.email_verified_at !== null,
		credits: row.credits ?? 0
	};
}

/** Record salted hashes of the IP and device cookie for multi-account detection. */
export async function recordSignals(db: D1Database, userId: string, ip: string, deviceId: string, salt: string) {
	const now = Date.now();
	const stmt = db.prepare(
		`INSERT INTO user_signals (user_id, kind, value_hash, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT (user_id, kind, value_hash) DO UPDATE SET last_seen = excluded.last_seen`
	);
	const batch = [stmt.bind(userId, 'device', await sha256(salt + ':d:' + deviceId), now, now)];
	if (ip) batch.push(stmt.bind(userId, 'ip', await sha256(salt + ':i:' + ip), now, now));
	await db.batch(batch);
}

export async function verifyTurnstile(secret: string | undefined, token: string | null, ip: string) {
	if (!secret) return true; // not configured (local dev)
	if (!token) return false;
	const body = new FormData();
	body.append('secret', secret);
	body.append('response', token);
	if (ip) body.append('remoteip', ip);
	const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
	const data = (await res.json()) as { success: boolean };
	return data.success;
}
