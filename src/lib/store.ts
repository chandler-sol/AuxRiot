/** Beat store rules shared by the browser (earnings preview) and the server (checkout). */

export const PROCESSING = { pct: 0.029, fixedCents: 30 } as const;
export const MAX_FILE_BYTES = 400 * 1024 * 1024; // full-length WAV/MP3
export const MAX_STEMS_BYTES = 4 * 1024 * 1024 * 1024; // stems zip
export const PART_BYTES = 50 * 1024 * 1024; // upload chunk (Workers cap request bodies at 100 MB)

export const GENRES = ['Trap', 'Drill', 'Boom Bap', 'R&B', 'Lo-fi', 'Pop', 'Afrobeats', 'Reggaeton', 'House', 'Dancehall', 'Rock', 'Experimental', 'Other'];
export const MOODS = ['Dark', 'Hype', 'Chill', 'Sad', 'Happy', 'Aggressive', 'Romantic', 'Epic', 'Smooth', 'Bouncy', 'Eerie', 'Soulful'];
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const KEYS = NOTES.flatMap((n) => [`${n} major`, `${n} minor`]);

export interface Split {
	priceCents: number;
	discountCents: number;
	paidCents: number;
	feeCents: number;
	processingCents: number;
	netCents: number;
}

/**
 * Who gets what from one sale.
 * - Producer code: comes off the sale price. Our fee is on what the buyer paid, so we share the discount.
 * - Site-wide code (ours): the buyer pays less, but the producer is paid as if they paid full price.
 *   The difference comes out of our fee (site codes are capped at the fee % so that never goes negative).
 * Card processing (2.9% + 30¢ on what the buyer actually paid) comes out of the producer's share.
 */
export function splitSale(priceCents: number, feePct: number, discount?: { percentOff: number; siteWide: boolean }): Split {
	const discountCents = discount ? Math.round((priceCents * discount.percentOff) / 100) : 0;
	const paidCents = priceCents - discountCents;
	const processingCents = paidCents > 0 ? Math.round(paidCents * PROCESSING.pct) + PROCESSING.fixedCents : 0;
	const basis = discount?.siteWide ? priceCents : paidCents;
	const grossFee = Math.round((basis * feePct) / 100);
	const feeCents = discount?.siteWide ? grossFee - discountCents : grossFee;
	const netCents = paidCents - feeCents - processingCents;
	return { priceCents, discountCents, paidCents, feeCents, processingCents, netCents };
}

export const money = (cents: number | null | undefined) =>
	cents == null ? '' : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
export const money2 = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const formatSize = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
