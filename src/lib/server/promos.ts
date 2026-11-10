import { newId, HOUR } from './util.ts';

/** How many battles can be promoted at the same time. */
export const PROMO_SLOTS = 2;
export const PROMO_MAX_HOURS = 24;
/** How far ahead a promo can be booked. */
export const PROMO_MAX_LEAD = 14 * 24 * HOUR;

interface Window {
	starts_at: number;
	ends_at: number;
}

/** Highest number of bookings running at the same moment anywhere inside [start, end). */
function peakOverlap(bookings: Window[], start: number, end: number): number {
	const inside = bookings.filter((b) => b.starts_at < end && b.ends_at > start);
	// Concurrency only changes at booking starts, so checking those points (and `start`) is enough.
	const points = [start, ...inside.map((b) => b.starts_at).filter((t) => t > start && t < end)];
	let peak = 0;
	for (const t of points) {
		const n = inside.filter((b) => b.starts_at <= t && b.ends_at > t).length;
		if (n > peak) peak = n;
	}
	return peak;
}

/**
 * Earliest start at or after `earliest` where a promo of `durationMs` fits
 * without exceeding PROMO_SLOTS concurrent promos. Candidates are `earliest`
 * itself and every moment an existing booking ends (when a slot frees up).
 */
export function findSlot(bookings: Window[], earliest: number, durationMs: number, avoid: Window[] = []): number | null {
	const candidates = [earliest, ...[...bookings, ...avoid].map((b) => b.ends_at).filter((t) => t > earliest)].sort((x, y) => x - y);
	for (const t of candidates) {
		if (t - earliest > PROMO_MAX_LEAD) break;
		const end = t + durationMs;
		if (avoid.some((w) => w.starts_at < end && w.ends_at > t)) continue; // never overlap the same battle's own promo
		if (peakOverlap(bookings, t, end) < PROMO_SLOTS) return t;
	}
	return null;
}

export async function upcomingBookings(db: D1Database, now: number): Promise<Window[]> {
	const rows = await db
		.prepare('SELECT starts_at, ends_at FROM promotions WHERE cancelled = 0 AND ends_at > ?')
		.bind(now)
		.all<Window>();
	return rows.results;
}

export type BookResult =
	| { ok: true; id: string; startsAt: number; endsAt: number }
	| { ok: false; error: string; nextAt?: number };

/**
 * Book a promo window for a battle. `mode: 'next'` takes the earliest free
 * window; `mode: 'at'` requires the exact start time to be free. Shared by the
 * admin tools now and the credits checkout later.
 */
export async function bookPromotion(
	db: D1Database,
	opts: { battleId: string; bookedBy: string; hours: number; mode: 'next' | 'at'; startAt?: number; source: 'admin' | 'credits' }
): Promise<BookResult> {
	const now = Date.now();
	const { battleId, hours } = opts;
	if (!Number.isInteger(hours) || hours < 1 || hours > PROMO_MAX_HOURS) {
		return { ok: false, error: `Promos run 1–${PROMO_MAX_HOURS} hours.` };
	}
	const battle = await db
		.prepare('SELECT id, status, voting_ends_at FROM battles WHERE id = ?')
		.bind(battleId)
		.first<{ id: string; status: string; voting_ends_at: number | null }>();
	if (!battle) return { ok: false, error: 'Battle not found.' };
	if (battle.status !== 'open' && battle.status !== 'voting') {
		return { ok: false, error: 'Only open or live battles can be promoted.' };
	}

	const duration = hours * HOUR;
	const bookings = await upcomingBookings(db, now);
	const own = (
		await db
			.prepare('SELECT starts_at, ends_at FROM promotions WHERE battle_id = ? AND cancelled = 0 AND ends_at > ?')
			.bind(battleId, now)
			.all<Window>()
	).results;
	let start: number | null;
	if (opts.mode === 'at') {
		const at = opts.startAt ?? NaN;
		if (!Number.isFinite(at)) return { ok: false, error: 'Pick a start time.' };
		start = Math.max(at, now);
		if (start - now > PROMO_MAX_LEAD) return { ok: false, error: 'Promos can be booked up to 14 days ahead.' };
		if (own.some((w) => w.starts_at < start! + duration && w.ends_at > start!)) {
			return { ok: false, error: 'This battle is already promoted during that time.' };
		}
		if (peakOverlap(bookings, start, start + duration) >= PROMO_SLOTS) {
			const next = findSlot(bookings, start, duration, own);
			return next
				? { ok: false, error: 'Both promo slots are taken then.', nextAt: next }
				: { ok: false, error: 'Both promo slots are booked for the next two weeks.' };
		}
	} else {
		start = findSlot(bookings, now, duration, own);
		if (start === null) return { ok: false, error: 'Both promo slots are booked for the next two weeks.' };
	}
	const end = start + duration;

	if (battle.status === 'voting' && battle.voting_ends_at && start >= battle.voting_ends_at) {
		return { ok: false, error: 'That battle closes before the promo would start.' };
	}
	const id = newId();
	await db
		.prepare(
			'INSERT INTO promotions (id, battle_id, booked_by, source, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(id, battleId, opts.bookedBy, opts.source, start, end, now)
		.run();
	return { ok: true, id, startsAt: start, endsAt: end };
}

/** Battles promoted right now (still open or live), newest booking first. */
export async function activePromotedIds(db: D1Database, now: number): Promise<string[]> {
	const rows = await db
		.prepare(
			`SELECT p.battle_id FROM promotions p JOIN battles b ON b.id = p.battle_id
			 WHERE p.cancelled = 0 AND p.starts_at <= ? AND p.ends_at > ? AND b.status IN ('open', 'voting')
			 ORDER BY p.starts_at ASC LIMIT ?`
		)
		.bind(now, now, PROMO_SLOTS)
		.all<{ battle_id: string }>();
	return rows.results.map((r) => r.battle_id);
}
