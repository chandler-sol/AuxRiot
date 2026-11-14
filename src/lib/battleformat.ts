/** Battle formats: a single beat, best of 3, or best of 5. */
export const FORMATS = {
	1: { label: '1 beat', short: '1v1', hours: [24, 48], defaultHours: 48, multiplier: 1 },
	3: { label: 'Best of 3', short: 'Bo3', hours: [48, 72], defaultHours: 48, multiplier: 2 },
	5: { label: 'Best of 5', short: 'Bo5', hours: [72, 96], defaultHours: 72, multiplier: 3 }
} as const;

export type Rounds = keyof typeof FORMATS;
export const isRounds = (n: number): n is Rounds => n === 1 || n === 3 || n === 5;
export const formatOf = (n: number | null | undefined) => FORMATS[isRounds(Number(n)) ? (Number(n) as Rounds) : 1];

/** Open challenges play a short preview so challengers decide from a taste, not the whole beat. */
export const OPEN_PREVIEW_SECONDS = 10;

/** Overtime windows. */
export const OT_SUBMIT_HOURS = 24;
export const OT_VOTE_HOURS = 24;
/** Judges force overtime with a majority of counted ballots and at least this many judges. */
export const OT_FORCE_MIN_JUDGES = 5;
