import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { createSession, hashPassword } from '#lib/server/auth.ts';
import { consumeEmailToken, peekEmailToken } from '#lib/server/email.ts';

export const load: PageServerLoad = async ({ url, platform }) => {
	const token = url.searchParams.get('token') ?? '';
	const ok = token ? !!(await peekEmailToken(getEnv(platform).DB, token, 'reset')) : false;
	return { token, valid: ok };
};

export const actions: Actions = {
	default: async ({ request, platform, cookies, url }) => {
		const env = getEnv(platform);
		const f = await request.formData();
		const token = String(f.get('token') ?? '');
		const password = String(f.get('password') ?? '');
		if (password.length < 8 || password.length > 200) return fail(400, { error: 'Password must be at least 8 characters.' });

		const userId = await consumeEmailToken(env.DB, token, 'reset');
		if (!userId) return fail(400, { error: 'This reset link expired or was already used. Request a new one.' });

		// New password, and every existing session (other devices) is signed out.
		// Getting the link proves they own the inbox, so the email counts as verified too.
		await env.DB.batch([
			env.DB.prepare('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(
				await hashPassword(password),
				Date.now(),
				userId
			),
			env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId)
		]);
		await createSession(env.DB, cookies, userId, url.protocol === 'https:');
		redirect(303, '/battles');
	}
};
