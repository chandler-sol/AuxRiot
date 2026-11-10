/**
 * Per-battle color pairs. Each battle is printed in its own pair, picked
 * deterministically from the battle id so it never changes. Pairs are
 * high-contrast on the dark background, never red-vs-green, and the two
 * battlers in a battle never share a color.
 */
export interface ColorPair {
	name: string;
	a: string; // creator (corner A)
	b: string; // challenger (corner B)
}

export const PAIRS: ColorPair[] = [
	{ name: 'NEON', a: '#FF3D7F', b: '#2BD9F5' },
	{ name: 'RAVE', a: '#D7FF3A', b: '#9B6BFF' },
	{ name: 'HEAT', a: '#FF7A1A', b: '#3D7BFF' },
	{ name: 'GOLD', a: '#FFC531', b: '#E040FB' },
	{ name: 'ACID', a: '#9DFF4F', b: '#FF4FD8' },
	{ name: 'ICE', a: '#A5F3FC', b: '#FF9F1C' }
];

export function pairFor(battleId: string): ColorPair {
	let h = 0;
	for (let i = 0; i < battleId.length; i++) h = (h * 31 + battleId.charCodeAt(i)) >>> 0;
	return PAIRS[h % PAIRS.length];
}

/** Inline style string that exposes the pair as CSS variables --a and --b. */
export function pairStyle(battleId: string): string {
	const p = pairFor(battleId);
	return `--a:${p.a};--b:${p.b}`;
}
