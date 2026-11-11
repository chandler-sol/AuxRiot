/**
 * Commenter flair, earned from respect: upvotes on your visible comments,
 * where any one person counts at most RESPECT_PER_FAN times toward you, so a
 * single fan (or alt) can't carry someone up the ladder.
 */
export const RESPECT_PER_FAN = 3;

export const FLAIR = [
	{ min: 250, label: 'Tastemaker', tier: 3 },
	{ min: 75, label: 'Trusted ear', tier: 2 },
	{ min: 15, label: 'Sharp ear', tier: 1 }
] as const;

export type Flair = (typeof FLAIR)[number];

export function flairFor(respect: number | null | undefined): Flair | null {
	return FLAIR.find((f) => (respect ?? 0) >= f.min) ?? null;
}

/** The next tier up and how far away it is. */
export function nextFlair(respect: number) {
	const next = [...FLAIR].reverse().find((f) => respect < f.min);
	return next ? { ...next, need: next.min - respect } : null;
}
