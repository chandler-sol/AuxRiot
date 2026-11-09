import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { destroySession } from '#lib/server/auth.ts';
import { getEnv } from '#lib/server/util.ts';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ platform, cookies }) => {
		await destroySession(getEnv(platform).DB, cookies);
		redirect(303, '/');
	}
};
