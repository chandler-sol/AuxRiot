/**
 * Privacy Policy §8: anti-fraud hashes and ordinary security logs are kept for up to
 * 12 months from collection. The cron trims them a little at a time (D1 prefers small batches).
 * Signature records (acceptances) are evidence for signed deals and are kept as the policy describes.
 */
const YEAR = 365 * 86_400_000;

export async function purgeExpiredSignals(db: D1Database) {
	const cutoff = Date.now() - YEAR;
	await db.batch([
		// Device/IP hashes for linked-account checks: dropped 12 months after they were first collected.
		db.prepare('DELETE FROM user_signals WHERE rowid IN (SELECT rowid FROM user_signals WHERE first_seen < ? LIMIT 500)').bind(cutoff),
		// Per-device view hashes (view totals on battles are kept).
		db.prepare('DELETE FROM battle_views WHERE rowid IN (SELECT rowid FROM battle_views WHERE viewed_at < ? LIMIT 500)').bind(cutoff),
		// Rate-limit attempts (normally pruned within a day) and expired sessions.
		db.prepare('DELETE FROM auth_attempts WHERE created_at < ?').bind(Date.now() - 86_400_000),
		db.prepare('DELETE FROM sessions WHERE rowid IN (SELECT rowid FROM sessions WHERE expires_at < ? LIMIT 500)').bind(Date.now())
	]);
}
