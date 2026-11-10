/** Runtime settings stored in D1, falling back to wrangler vars. */

export const VOTER_AGE_KEY = 'voter_min_age_hours';

export async function getVoterMinAgeHours(db: D1Database, env: Env): Promise<number> {
	const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(VOTER_AGE_KEY).first<{ value: string }>();
	const n = Number(row?.value ?? env.MIN_VOTER_ACCOUNT_AGE_HOURS);
	return Number.isFinite(n) && n >= 0 ? n : 168;
}

export async function setSetting(db: D1Database, key: string, value: string, by: string) {
	await db
		.prepare(
			`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
		)
		.bind(key, value, Date.now(), by)
		.run();
}

/** "24 hours", "3 days", "1 week" — for user-facing copy. */
export function describeHours(h: number): string {
	if (h <= 0) return '';
	if (h % 168 === 0) return h === 168 ? '1 week' : `${h / 168} weeks`;
	if (h % 24 === 0) return h === 24 ? '24 hours' : `${h / 24} days`;
	return `${h} hour${h === 1 ? '' : 's'}`;
}
