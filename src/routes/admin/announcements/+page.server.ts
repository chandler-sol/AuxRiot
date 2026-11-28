import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { logAction, requireAdmin } from '#lib/server/mod.ts';

/** On-site announcement pop-ups: write, switch on/off, see how many people closed each. */
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const rows = await getEnv()
		.DB.prepare(
			`SELECT a.id, a.title, a.body, a.button_label, a.button_url, a.audience, a.active, a.starts_at, a.ends_at, a.created_at, a.created_by,
			        (SELECT COUNT(*) FROM announcement_dismissals d WHERE d.announcement_id = a.id) AS dismissals
			 FROM announcements a ORDER BY a.created_at DESC LIMIT 50`
		)
		.all<{ id: string; title: string; body: string; button_label: string | null; button_url: string | null; audience: string; active: number; starts_at: number | null; ends_at: number | null; created_at: number; created_by: string; dismissals: number }>();
	return { announcements: rows.results, now: Date.now() };
};

const AUDIENCES = ['all', 'signed_in', 'signed_out'];
const when = (v: FormDataEntryValue | null) => {
	const s = String(v ?? '').trim();
	if (!s) return null;
	const t = Date.parse(s);
	return Number.isFinite(t) ? t : NaN;
};

function readForm(f: FormData) {
	const title = String(f.get('title') ?? '').trim().slice(0, 120);
	const body = String(f.get('body') ?? '').trim().slice(0, 1200);
	const label = String(f.get('button_label') ?? '').trim().slice(0, 40) || null;
	const link = String(f.get('button_url') ?? '').trim().slice(0, 500) || null;
	const audience = AUDIENCES.includes(String(f.get('audience'))) ? String(f.get('audience')) : 'all';
	const starts = when(f.get('starts_at'));
	const ends = when(f.get('ends_at'));
	if (title.length < 2 || body.length < 2) return { error: 'Give it a title and a message.' };
	if ((label && !link) || (!label && link)) return { error: 'A button needs both a label and a link (or leave both empty).' };
	if (link && !/^(\/(?!\/)|https:\/\/)/.test(link)) return { error: 'Links must start with / (a page on AuxRiot) or https://.' };
	if (Number.isNaN(starts) || Number.isNaN(ends)) return { error: 'Check the start and end times.' };
	if (starts && ends && ends <= starts) return { error: 'The end has to be after the start.' };
	return { title, body, label, link, audience, starts, ends };
}

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const f = await request.formData();
		const v = readForm(f);
		if ('error' in v) return fail(400, { error: v.error });
		const db = getEnv().DB;
		const now = Date.now();
		const id = String(f.get('id') ?? '');
		const publish = f.get('go') === 'publish';
		if (id) {
			// Editing keeps the same id, so people who already closed it won't see it again.
			await db
				.prepare(`UPDATE announcements SET title = ?, body = ?, button_label = ?, button_url = ?, audience = ?, starts_at = ?, ends_at = ?, active = CASE WHEN ? THEN 1 ELSE active END, updated_at = ? WHERE id = ?`)
				.bind(v.title, v.body, v.label, v.link, v.audience, v.starts, v.ends, publish ? 1 : 0, now, id)
				.run();
		} else {
			await db
				.prepare(`INSERT INTO announcements (id, title, body, button_label, button_url, audience, active, starts_at, ends_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
				.bind(newId(), v.title, v.body, v.label, v.link, v.audience, publish ? 1 : 0, v.starts, v.ends, me.username, now, now)
				.run();
		}
		await logAction(db, me, publish ? 'announcement.publish' : 'announcement.save', 'settings', id || 'new', v.title);
		return { ok: publish ? 'Live. Visitors see it on their next page load, once.' : 'Saved as a draft.' };
	},
	toggle: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const on = f.get('on') === '1';
		const db = getEnv().DB;
		await db.prepare('UPDATE announcements SET active = ?, updated_at = ? WHERE id = ?').bind(on ? 1 : 0, Date.now(), id).run();
		await logAction(db, me, on ? 'announcement.on' : 'announcement.off', 'settings', id, '');
		return { ok: on ? 'Switched on.' : 'Switched off.' };
	},
	remove: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		const db = getEnv().DB;
		await db.batch([db.prepare('DELETE FROM announcement_dismissals WHERE announcement_id = ?').bind(id), db.prepare('DELETE FROM announcements WHERE id = ?').bind(id)]);
		await logAction(db, me, 'announcement.delete', 'settings', id, '');
		return { ok: 'Deleted.' };
	}
};
