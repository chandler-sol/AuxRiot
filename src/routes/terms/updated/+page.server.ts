import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { recordAcceptance, TERMS_VERSION } from '#lib/server/acceptances.ts';

/** Terms of Service §8: material changes are shown before they take effect, with new acceptance. */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const u = await getEnv().DB.prepare('SELECT terms_version FROM users WHERE id = ?').bind(locals.user.id).first<{ terms_version: string | null }>();
	return { accepted: u?.terms_version === TERMS_VERSION, version: TERMS_VERSION, next: url.searchParams.get('next') ?? '/' };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		if (!locals.user) redirect(303, '/login');
		const f = await request.formData();
		if (f.get('agree') !== 'on') return fail(400, { error: 'Tick the box to accept the updated terms.' });
		const env = getEnv();
		await recordAcceptance(env, {
			kind: 'site_terms', userId: locals.user.id, docVersion: TERMS_VERSION, request,
			statement: 'I have reviewed and accept the updated Terms of Service and Privacy Policy (version 5).'
		});
		await env.DB.prepare('UPDATE users SET terms_version = ?, terms_accepted_at = ? WHERE id = ?').bind(TERMS_VERSION, Date.now(), locals.user.id).run();
		const next = String(f.get('next') ?? '/');
		redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : url.origin);
	}
};
