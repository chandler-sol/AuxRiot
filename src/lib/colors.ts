/**
 * Battle colors.
 *
 * Every user can pick a signature color from PALETTE. When a battle starts,
 * the creator's color is locked in as corner A. The challenger keeps their
 * color too unless it clashes (same color family, or a combination that's hard
 * to tell apart for colorblind voters); then they get the creator's partner.
 * Users without a pick fall back to a pair derived from the battle id, and
 * older battles without stored colors use that same pair.
 */
export interface PaletteColor {
	key: string;
	label: string;
	hex: string;
	group: string; // colors in the same group are too similar to face each other
	partner: string; // best contrasting opponent
}

export const PALETTE: PaletteColor[] = [
	{ key: 'pink', label: 'Hot pink', hex: '#FF3D7F', group: 'pink', partner: 'cyan' },
	{ key: 'cyan', label: 'Cyan', hex: '#2BD9F5', group: 'cyan', partner: 'pink' },
	{ key: 'lime', label: 'Lime', hex: '#D7FF3A', group: 'green', partner: 'violet' },
	{ key: 'violet', label: 'Violet', hex: '#9B6BFF', group: 'purple', partner: 'lime' },
	{ key: 'orange', label: 'Orange', hex: '#FF7A1A', group: 'orange', partner: 'blue' },
	{ key: 'blue', label: 'Electric blue', hex: '#3D7BFF', group: 'purple', partner: 'orange' },
	{ key: 'gold', label: 'Gold', hex: '#FFC531', group: 'orange', partner: 'magenta' },
	{ key: 'magenta', label: 'Magenta', hex: '#E040FB', group: 'pink', partner: 'gold' },
	{ key: 'acid', label: 'Acid', hex: '#9DFF4F', group: 'green', partner: 'orchid' },
	{ key: 'orchid', label: 'Orchid', hex: '#FF4FD8', group: 'pink', partner: 'acid' },
	{ key: 'ice', label: 'Ice', hex: '#A5F3FC', group: 'cyan', partner: 'amber' },
	{ key: 'amber', label: 'Amber', hex: '#FF9F1C', group: 'orange', partner: 'ice' }
];

const BY_KEY = new Map(PALETTE.map((c) => [c.key, c]));
export const DEFAULT_COLOR = 'pink';

export function colorByKey(key: string | null | undefined): PaletteColor | undefined {
	return key ? BY_KEY.get(key) : undefined;
}

export function hexFor(key: string | null | undefined, fallback = '#FF3D7F'): string {
	return colorByKey(key)?.hex ?? fallback;
}

/** Can these two colors face each other in a battle? */
export function canFace(a: string, b: string): boolean {
	const ca = BY_KEY.get(a);
	const cb = BY_KEY.get(b);
	if (!ca || !cb || a === b) return false;
	if (ca.group === cb.group) return false;
	// Bright orange/yellow vs bright green blur together for red-green colorblindness.
	const pair = [ca.group, cb.group].sort().join('+');
	return pair !== 'green+orange';
}

// Fallback pairs (by palette key) for users who never picked a color.
const PAIRS: [string, string][] = [
	['pink', 'cyan'],
	['lime', 'violet'],
	['orange', 'blue'],
	['gold', 'magenta'],
	['acid', 'orchid'],
	['ice', 'amber']
];

function hashPair(battleId: string): [string, string] {
	let h = 0;
	for (let i = 0; i < battleId.length; i++) h = (h * 31 + battleId.charCodeAt(i)) >>> 0;
	return PAIRS[h % PAIRS.length];
}

/** Corner A color key for a new battle. */
export function creatorColor(battleId: string, userColor: string | null | undefined): string {
	return colorByKey(userColor) ? userColor! : hashPair(battleId)[0];
}

/** Corner B color key, guaranteed to be distinct and readable against corner A. */
export function challengerColor(battleId: string, colorA: string, userColor: string | null | undefined): string {
	if (userColor && canFace(colorA, userColor)) return userColor;
	const fallback = hashPair(battleId)[1];
	if (!userColor && canFace(colorA, fallback)) return fallback;
	return BY_KEY.get(colorA)?.partner ?? 'cyan';
}

/** Resolved [A, B] hex colors for a battle (stored keys win; older battles use the id pair). */
export function battleColors(battleId: string, colorA?: string | null, colorB?: string | null): [string, string] {
	const [pa, pb] = hashPair(battleId);
	const a = colorByKey(colorA) ? colorA! : pa;
	const b = colorByKey(colorB) ? colorB! : canFace(a, pb) ? pb : (BY_KEY.get(a)?.partner ?? pb);
	return [hexFor(a), hexFor(b)];
}

/** Inline style string exposing the battle's colors as CSS variables --a and --b. */
export function pairStyle(battleId: string, colorA?: string | null, colorB?: string | null): string {
	const [a, b] = battleColors(battleId, colorA, colorB);
	return `--a:${a};--b:${b}`;
}
