import { newId, HOUR } from './util.ts';

/** How many battles can be promoted at the same time (slot 1 and slot 2). */
export const PROMO_SLOTS = 2;
export const PROMO_MAX_HOURS = 24;
/** How far ahead the queue may reach. */
export const PROMO_MAX_LEAD = 14 * 24 * HOUR;

interface Booking {
	starts_at: number;
	ends_at: number;
	slot: number | null;
}

const overlaps = (a: { starts_at: number; ends_at: number }, start: number, end: number) =>
	a.starts_at < end && a.ends_at > start;

/**
 * Earliest [start, start + duration) at or after `earliest` where one slot is
 * free for the whole window. Each slot is checked independently, so a promo
 * keeps the same slot from start to finish. Ties go to the lower slot number.
 * `avoid` holds this battle's own promos, which it must never overlap.
 */
export function findSlot(
	bookings: Booking[],
	earliest: number,
	durationMs: number,
	avoid: { starts_at: number; ends_at: number }[] = []
): { start: number; slot: number } | null {
	let best: { start: number; slot: number } | null = null;
	for (let slot = 1; slot <= PROMO_SLOTS; slot++) {
		// Legacy rows without a slot count against every slot.
		const inSlot = bookings.filter((b) => b.slot === slot || b.slot === null);
		const candidates = [earliest, ...[...inSlot, ...avoid].map((b) => b.ends_at).filter((t) => t > earliest)].sort(
			(x, y) => x - y
		);
		for (const t of candidates) {
			if (t - earliest > PROMO_MAX_LEAD) break;
			const end = t + durationMs;
			if (avoid.some((w) => overlaps(w, t, end))) continue;
			if (inSlot.some((b) => overlaps(b, t, end))) continue;
			if (!best || t < best.start) best = { start: t, slot };
			break;
		}
	}
	return best;
}

async function upcomingBookings(db: D1Database, now: number): Promise<Booking[]> {
	const rows = await db
		.prepare('SELECT starts_at, ends_at, slot FROM promotions WHERE cancelled = 0 AND ends_at > ?')
		.bind(now)
		.all<Booking>();
	return rows.results;
}

export type BookResult =
	| { ok: true; id: string; startsAt: number; endsAt: number; slot: number; startsNow: boolean }
	| { ok: false; error: string; nextAt?: number };

/**
 * Book a promo for a battle. By default (`mode: 'next'`) it is placed
 * automatically in the earliest opening across both slots. `mode: 'at'`
 * (reserved for a future scheduler) requires a specific start to be free.
 * Shared by the admin tools now and the credits checkout later.
 */
export async function bookPromotion(
	db: D1Database,
	opts: { battleId: string; bookedBy: string; hours: number; mode?: 'next' | 'at'; startAt?: number; source: 'admin' | 'credits' }
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
			.all<{ starts_at: number; ends_at: number }>()
	).results;

	let placed: { start: number; slot: number } | null;
	if (opts.mode === 'at') {
		const at = Math.max(opts.startAt ?? NaN, now);
		if (!Number.isFinite(at)) return { ok: false, error: 'Pick a start time.' };
		if (at - now > PROMO_MAX_LEAD) return { ok: false, error: 'Promos can be booked up to 14 days ahead.' };
		placed = findSlot(bookings, at, duration, own);
		if (placed && placed.start !== at) {
			return { ok: false, error: 'Both promo slots are taken then.', nextAt: placed.start };
		}
	} else {
		placed = findSlot(bookings, now, duration, own);
	}
	if (!placed) return { ok: false, error: 'Both promo slots are booked for the next two weeks.' };

	const { start, slot } = placed;
	const end = start + duration;
	if (battle.status === 'voting' && battle.voting_ends_at && start >= battle.voting_ends_at) {
		return { ok: false, error: 'The next opening is after this battle closes.' };
	}
	const id = newId();
	await db
		.prepare(
			'INSERT INTO promotions (id, battle_id, booked_by, source, starts_at, ends_at, slot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(id, battleId, opts.bookedBy, opts.source, start, end, slot, now)
		.run();
	return { ok: true, id, startsAt: start, endsAt: end, slot, startsNow: start <= now + 1000 };
}

/** Where a new promo of `hours` would land right now, without booking it. */
export async function previewSlot(db: D1Database, battleId: string, hours: number) {
	const now = Date.now();
	const bookings = await upcomingBookings(db, now);
	const own = (
		await db
			.prepare('SELECT starts_at, ends_at FROM promotions WHERE battle_id = ? AND cancelled = 0 AND ends_at > ?')
			.bind(battleId, now)
			.all<{ starts_at: number; ends_at: number }>()
	).results;
	return findSlot(bookings, now, hours * HOUR, own);
}

/** Battles promoted right now (still open or live), in slot order. */
export async function activePromotedIds(db: D1Database, now: number): Promise<string[]> {
	const rows = await db
		.prepare(
			`SELECT p.battle_id FROM promotions p JOIN battles b ON b.id = p.battle_id
			 WHERE p.cancelled = 0 AND p.starts_at <= ? AND p.ends_at > ? AND b.status IN ('open', 'voting')
			 ORDER BY COALESCE(p.slot, 9), p.starts_at ASC LIMIT ?`
		)
		.bind(now, now, PROMO_SLOTS)
		.all<{ battle_id: string }>();
	return rows.results.map((r) => r.battle_id);
}

/** The battle's current or next promo, for showing its status to the creator. */
export async function promoStatus(db: D1Database, battleId: string, now: number) {
	return db
		.prepare(
			`SELECT starts_at, ends_at, slot FROM promotions
			 WHERE battle_id = ? AND cancelled = 0 AND ends_at > ? ORDER BY starts_at ASC LIMIT 1`
		)
		.bind(battleId, now)
		.first<{ starts_at: number; ends_at: number; slot: number | null }>();
}
