/** Service categories. Mixing-type services show samples as a before/after pair. */
export const SERVICE_CATEGORIES = [
	{ key: 'mixing', label: 'Mixing', beforeAfter: true, hint: 'Balance, EQ, compression, effects' },
	{ key: 'mastering', label: 'Mastering', beforeAfter: true, hint: 'Loudness, polish, release-ready' },
	{ key: 'custom_beat', label: 'Custom beat', beforeAfter: false, hint: 'A beat made to order' },
	{ key: 'vocal_mix', label: 'Vocal mix / tuning', beforeAfter: true, hint: 'Vocal chain, tuning, comping' },
	{ key: 'feature', label: 'Feature', beforeAfter: false, hint: 'A verse, hook or instrument on your track' }
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]['key'];

export const categoryOf = (key: string) => SERVICE_CATEGORIES.find((c) => c.key === key) ?? null;
export const isCategory = (key: string): key is ServiceCategory => SERVICE_CATEGORIES.some((c) => c.key === key);

export const MAX_SERVICES = 8;
export const MAX_SAMPLES = 4;
