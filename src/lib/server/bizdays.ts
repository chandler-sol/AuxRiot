/**
 * Business-day deadlines for the copyright-block refund (Store Terms §7):
 * "5 p.m. Eastern time on the 14th business day after the block began. Count
 * weekdays after the block date, excluding observed U.S. federal holidays."
 */

const ET = 'America/New_York';

/** Y-M-D of a moment, in Eastern time. */
export function etDate(ms: number): { y: number; m: number; d: number } {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])
	);
	return { y: +p.year, m: +p.month, d: +p.day };
}

const key = (y: number, m: number, d: number) => `${y}-${m}-${d}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
/** nth weekday (0=Sun) of a month; n = -1 for the last one. */
function nth(y: number, m: number, weekday: number, n: number) {
	if (n > 0) {
		const first = dow(y, m, 1);
		return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
	}
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return last - ((dow(y, m, last) - weekday + 7) % 7);
}

/** Observed U.S. federal holidays (5 U.S.C. § 6103) for one year, as Y-M-D keys. */
export function federalHolidays(y: number): Set<string> {
	const out = new Set<string>();
	const fixed = (m: number, d: number) => {
		const w = dow(y, m, d);
		const t = new Date(Date.UTC(y, m - 1, d + (w === 6 ? -1 : w === 0 ? 1 : 0)));
		out.add(key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()));
	};
	fixed(1, 1); // New Year's Day
	out.add(key(y, 1, nth(y, 1, 1, 3))); // Birthday of Martin Luther King, Jr.
	out.add(key(y, 2, nth(y, 2, 1, 3))); // Washington's Birthday
	out.add(key(y, 5, nth(y, 5, 1, -1))); // Memorial Day
	fixed(6, 19); // Juneteenth
	fixed(7, 4); // Independence Day
	out.add(key(y, 9, nth(y, 9, 1, 1))); // Labor Day
	out.add(key(y, 10, nth(y, 10, 1, 2))); // Columbus Day
	fixed(11, 11); // Veterans Day
	out.add(key(y, 11, nth(y, 11, 4, 4))); // Thanksgiving
	fixed(12, 25); // Christmas
	// Next year's New Year's Day can be observed on Dec 31 of this year.
	if (dow(y + 1, 1, 1) === 6) out.add(key(y, 12, 31));
	return out;
}

/** UTC ms for a wall-clock time in Eastern time (handles daylight saving). */
export function etWallTime(y: number, m: number, d: number, hour: number) {
	const guess = Date.UTC(y, m - 1, d, hour);
	const shown = new Date(new Date(guess).toLocaleString('en-US', { timeZone: ET }));
	const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
	return guess + (asUtc.getTime() - shown.getTime());
}

/** 5 p.m. ET on the nth business day after the (Eastern) date of `fromMs`. */
export function businessDeadline(fromMs: number, days = 14): number {
	let { y, m, d } = etDate(fromMs);
	let count = 0;
	const hol = new Map<number, Set<string>>();
	const isHoliday = (yy: number, mm: number, dd: number) => {
		if (!hol.has(yy)) hol.set(yy, federalHolidays(yy));
		return hol.get(yy)!.has(key(yy, mm, dd));
	};
	while (count < days) {
		const t = new Date(Date.UTC(y, m - 1, d + 1));
		[y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
		const w = dow(y, m, d);
		if (w !== 0 && w !== 6 && !isHoliday(y, m, d)) count++;
	}
	return etWallTime(y, m, d, 17);
}

/** "December 17, 2026 at 5 p.m. Eastern time" */
export const formatDeadline = (ms: number) =>
	`${new Date(ms).toLocaleDateString('en-US', { timeZone: ET, month: 'long', day: 'numeric', year: 'numeric' })} at 5 p.m. Eastern time`;
