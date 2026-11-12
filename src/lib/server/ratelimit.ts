import { sha256 } from './util.ts';

/** Per-IP limits on auth endpoints (stored as salted hashes, pruned after a day). */
export const LIMITS = {
	login_fail: { max: 10, windowMs: 15 * 60_000, message: 'Too many failed logins. Wait 15 minutes and try again.' },
	signup: { max: 5, windowMs: 60 * 60_000, message: 'Too many new accounts from this network. Try again in an hour.' },
	forgot: { max: 5, windowMs: 60 * 60_000, message: 'Too many reset requests. Try again in an hour.' },
	oauth: { max: 30, windowMs: 15 * 60_000, message: 'Too many sign-in attempts. Wait a few minutes.' }
} as const;
export type LimitKind = keyof typeof LIMITS;

async function ipKey(ip: string, salt: string) {
	return sha256(`${salt}:rl:${ip || 'unknown'}`);
}

/** Returns an error message if this IP is over the limit for `kind`. Doesn't record anything. */
export async function overLimit(db: D1Database, ip: string, salt: string, kind: LimitKind) {
	const { max, windowMs, message } = LIMITS[kind];
	const row = await db
		.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE ip_hash = ? AND kind = ? AND created_at > ?')
		.bind(await ipKey(ip, salt), kind, Date.now() - windowMs)
		.first<{ n: number }>();
	return (row?.n ?? 0) >= max ? message : null;
}

export async function recordAttempt(db: D1Database, ip: string, salt: string, kind: LimitKind) {
	const now = Date.now();
	const stmts = [db.prepare('INSERT INTO auth_attempts (ip_hash, kind, created_at) VALUES (?, ?, ?)').bind(await ipKey(ip, salt), kind, now)];
	if (Math.random() < 0.05) stmts.push(db.prepare('DELETE FROM auth_attempts WHERE created_at < ?').bind(now - 86_400_000));
	await db.batch(stmts);
}
