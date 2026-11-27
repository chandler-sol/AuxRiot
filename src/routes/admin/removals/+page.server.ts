import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { logAction, requireMod } from '#lib/server/mod.ts';

/** Private image removal requests (Terms §7A): due within 48 hours of receipt. */
export const load: PageServerLoad = async ({ locals, url }) => {
	requireMod(locals);
	const status = url.searchParams.get('status') === 'done' ? 'done' : 'open';
	const rows = await getEnv()
		.DB.prepare(
			`SELECT id, location, details, signature, contact, on_behalf, status, due_at, resolved_at, resolved_by, note, created_at
			 FROM removal_requests WHERE ${status === 'open' ? "status = 'open'" : "status != 'open'"} ORDER BY ${status === 'open' ? 'due_at ASC' : 'resolved_at DESC'} LIMIT 100`
		)
		.all<{ id: string; location: string; details: string; signature: string; contact: string; on_behalf: number; status: string; due_at: number; resolved_at: number | null; resolved_by: string | null; note: string | null; created_at: number }>();
	return { status, requests: rows.results, now: Date.now() };
};

export const actions: Actions = {
	resolve: async ({ request, locals }) => {
		const me = requireMod(locals);
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const outcome = f.get('outcome') === 'rejected' ? 'rejected' : 'removed';
		const note = String(f.get('note') ?? '').trim().slice(0, 1000);
		if (outcome === 'rejected' && note.length < 5) return fail(400, { error: 'Say why it was not actioned (e.g. not intimate imagery, not found).', id });
		const db = getEnv().DB;
		await db.prepare(`UPDATE removal_requests SET status = ?, resolved_at = ?, resolved_by = ?, note = ? WHERE id = ? AND status = 'open'`).bind(outcome, Date.now(), me.username, note || null, id).run();
		await logAction(db, me, `removal.${outcome}`, 'removal_request', id, note);
		return { ok: outcome === 'removed' ? 'Marked removed. Contact the requester to confirm.' : 'Closed without removal.', id };
	}
};
