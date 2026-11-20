/**
 * @mentions in comments: shared by the server (who to notify) and the page
 * (turning known @names into profile links). Usernames are 3–20 letters,
 * numbers or underscores; an @ glued to another word (emails) doesn't count.
 */
export const MAX_MENTIONS = 5;
const RE = /(^|[^\w@])@([a-zA-Z0-9_]{3,20})(?![\w])/g;

/** Unique mentioned usernames, lowercased, in order of appearance. */
export function extractMentions(body: string): string[] {
	const out: string[] = [];
	for (const m of body.matchAll(RE)) {
		const u = m[2].toLowerCase();
		if (!out.includes(u)) out.push(u);
	}
	return out;
}

export type Part = { text: string } | { user: string };

/** Split a comment into text and @user parts; only names in `known` (lowercase) become links. */
export function mentionParts(body: string, known: ReadonlySet<string>): Part[] {
	const parts: Part[] = [];
	let last = 0;
	for (const m of body.matchAll(RE)) {
		const at = (m.index ?? 0) + m[1].length;
		if (!known.has(m[2].toLowerCase())) continue;
		if (at > last) parts.push({ text: body.slice(last, at) });
		parts.push({ user: m[2] });
		last = at + 1 + m[2].length;
	}
	if (last < body.length) parts.push({ text: body.slice(last) });
	return parts;
}
