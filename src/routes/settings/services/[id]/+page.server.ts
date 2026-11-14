import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { storeAudio } from '#lib/server/battles.ts';
import { loadServices } from '#lib/server/services.ts';
import { MAX_SAMPLES, categoryOf } from '#lib/services.ts';

async function own(locals: App.Locals, id: string, path: string) {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(path)}`);
	const db = getEnv().DB;
	const s = await db.prepare(`SELECT * FROM services WHERE id = ? AND user_id = ? AND status != 'removed'`).bind(id, locals.user.id).first<{ id: string; category: string; status: string }>();
	if (!s) error(404, 'Service not found');
	return { db, s, user: locals.user };
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { db, s, user } = await own(locals, params.id, url.pathname);
	const [card] = await loadServices(db, 's.id = ?', [s.id], 's.id', 1);
	return { service: card, category: categoryOf(s.category), maxSamples: MAX_SAMPLES, meId: user.id };
};

const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? '').replace(/[$,\s]/g, '')) * 100);

export const actions: Actions = {
	save: async ({ request, locals, params, url }) => {
		const { db, s } = await own(locals, params.id, url.pathname);
		const f = await request.formData();
		const title = String(f.get('title') ?? '').trim().slice(0, 80);
		const description = String(f.get('description') ?? '').trim().slice(0, 1200);
		const price = cents(f.get('price'));
		const days = Math.round(Number(f.get('turnaround')));
		const revisions = Math.round(Number(f.get('revisions')));
		if (title.length < 3) return fail(400, { error: 'Give it a title (3+ characters).' });
		if (!Number.isFinite(price) || price < 500 || price > 10_000_000) return fail(400, { error: 'Starting price must be at least $5.' });
		if (!Number.isFinite(days) || days < 1 || days > 90) return fail(400, { error: 'Turnaround is 1–90 days.' });
		if (!Number.isFinite(revisions) || revisions < 0 || revisions > 10) return fail(400, { error: 'Revisions are 0–10.' });
		let status = s.status;
		if (f.get('go') === 'live') {
			const n = await db.prepare('SELECT COUNT(*) AS n FROM service_samples WHERE service_id = ?').bind(s.id).first<{ n: number }>();
			if (!n?.n) return fail(400, { error: 'Add at least one sample so buyers can hear your work before it goes live.' });
			status = 'active';
		}
		if (f.get('go') === 'pause') status = 'paused';
		await db
			.prepare('UPDATE services SET title = ?, description = ?, price_from_cents = ?, turnaround_days = ?, revisions = ?, status = ?, updated_at = ? WHERE id = ?')
			.bind(title, description, price, days, revisions, status, Date.now(), s.id)
			.run();
		return { ok: status === 'active' ? (f.get('go') === 'live' ? "You're live — buyers can find you on the Services page. 🔥" : 'Saved.') : f.get('go') === 'pause' ? 'Paused — hidden from the Services page.' : 'Saved.' };
	},

	addSample: async ({ request, locals, params, url }) => {
		const { db, s } = await own(locals, params.id, url.pathname);
		const env = getEnv();
		const f = await request.formData();
		const title = String(f.get('title') ?? '').trim().slice(0, 80) || 'Sample';
		const n = await db.prepare('SELECT COUNT(*) AS n FROM service_samples WHERE service_id = ?').bind(s.id).first<{ n: number }>();
		if ((n?.n ?? 0) >= MAX_SAMPLES) return fail(400, { sampleError: `Up to ${MAX_SAMPLES} samples per service.` });
		const after = await storeAudio(env.AUDIO, f.get('audio') as File, String(f.get('peaks') ?? ''));
		if (typeof after === 'string') return fail(400, { sampleError: after });
		let before: Awaited<ReturnType<typeof storeAudio>> | null = null;
		const bf = f.get('before_audio');
		if (bf instanceof File && bf.size > 0) {
			before = await storeAudio(env.AUDIO, bf, String(f.get('before_peaks') ?? ''));
			if (typeof before === 'string') {
				await env.AUDIO.delete(after.key);
				return fail(400, { sampleError: `Before version: ${before}` });
			}
		}
		await db
			.prepare(
				`INSERT INTO service_samples (id, service_id, title, audio_key, duration_ms, peaks, before_key, before_duration_ms, before_peaks, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(newId(), s.id, title, after.key, after.durationMs, after.peaks, before?.key ?? null, before?.durationMs ?? null, before?.peaks ?? null, Date.now())
			.run();
		return { ok: 'Sample added.' };
	},

	deleteSample: async ({ request, locals, params, url }) => {
		const { db, s } = await own(locals, params.id, url.pathname);
		const id = String((await request.formData()).get('sample_id') ?? '');
		const row = await db.prepare('SELECT audio_key, before_key FROM service_samples WHERE id = ? AND service_id = ?').bind(id, s.id).first<{ audio_key: string; before_key: string | null }>();
		if (!row) return fail(404, { error: 'Sample not found.' });
		const env = getEnv();
		await env.AUDIO.delete(row.audio_key);
		if (row.before_key) await env.AUDIO.delete(row.before_key);
		await db.prepare('DELETE FROM service_samples WHERE id = ?').bind(id).run();
		return { ok: 'Sample removed.' };
	},

	remove: async ({ locals, params, url }) => {
		const { db, s } = await own(locals, params.id, url.pathname);
		await db.prepare(`UPDATE services SET status = 'removed', updated_at = ? WHERE id = ?`).bind(Date.now(), s.id).run();
		redirect(303, '/settings/services');
	}
};
