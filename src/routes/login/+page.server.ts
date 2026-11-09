import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSession, recordSignals, verifyPassword } from '#lib/server/auth.ts';
import { getEnv } from '#lib/server/util.ts';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

function safeNext(next: string | null) {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export const actions: Actions = {
	default: async ({ request, platform, cookies, locals, url }) => {
		const env = getEnv(platform);
		const form = await request.formData();
		const login = String(form.get('login') ?? '').trim();
		const password = String(form.get('password') ?? '');

		const user = await env.DB.prepare('SELECT id, password_hash FROM users WHERE username = ? OR email = ?')
			.bind(login, login.toLowerCase())
			.first<{ id: string; password_hash: string | null }>();
		if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
			return fail(400, { login, error: 'Wrong username/email or password.' });
		}
		await recordSignals(env.DB, user.id, locals.ip, locals.deviceId, env.SIGNAL_SALT ?? 'dev-salt');
		await createSession(env.DB, cookies, user.id, url.protocol === 'https:');
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
