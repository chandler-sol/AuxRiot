/** Labels an admin can give a verified account. Shown next to their name everywhere. */
export const VERIFIED_LABELS = ['Streamer', 'Producer', 'Artist', 'Engineer', 'Creator'] as const;
export type VerifiedLabel = (typeof VERIFIED_LABELS)[number];
export const isVerifiedLabel = (s: string): s is VerifiedLabel => (VERIFIED_LABELS as readonly string[]).includes(s);
