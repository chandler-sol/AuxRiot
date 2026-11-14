import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { loadServices } from '#lib/server/services.ts';
import { MAX_SERVICES, isCategory } from '#lib/services.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const services = await loadServices(getEnv().DB, "s.user_id = ? AND s.status != 'removed'", [locals.user.id], 's.created_at ASC', MAX_SERVICES);
	return { services, max: MAX_SERVICES, welcome: url.searchParams.get('welcome') === '1', meId: locals.user.id };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const db = getEnv().DB;
		const f = await request.formData();
		const category = String(f.get('category') ?? '');
		if (!isCategory(category)) return fail(400, { error: 'Pick a category.' });
		const count = await db.prepare(`SELECT COUNT(*) AS n FROM services WHERE user_id = ? AND status != 'removed'`).bind(locals.user.id).first<{ n: number }>();
		if ((count?.n ?? 0) >= MAX_SERVICES) return fail(400, { error: `You can offer up to ${MAX_SERVICES} services.` });
		const id = newId(10);
		const now = Date.now();
		const defaults: Record<string, [string, number, number, number]> = {
			mixing: ['Mixing', 15000, 5, 2],
			mastering: ['Mastering', 5000, 3, 2],
			custom_beat: ['Custom beat', 20000, 7, 2],
			vocal_mix: ['Vocal mix & tuning', 10000, 4, 2],
			feature: ['Feature', 15000, 7, 1]
		};
		const [title, price, days, revs] = defaults[category];
		await db
			.prepare(
				`INSERT INTO services (id, user_id, category, title, price_from_cents, turnaround_days, revisions, status, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'paused', ?, ?)`
			)
			.bind(id, locals.user.id, category, title, price, days, revs, now, now)
			.run();
		redirect(303, `/settings/services/${id}`);
	}
};
