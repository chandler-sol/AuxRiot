import type { LayoutServerLoad } from './$types';

import { getEnv } from '#lib/server/util.ts';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		beta: getEnv().ENVIRONMENT === 'beta',
		user: locals.user
			? { id: locals.user.id, username: locals.user.username, isAdmin: locals.user.isAdmin, isMod: locals.user.isMod, emailVerified: locals.user.emailVerified, credits: locals.user.credits, avatarKey: locals.user.avatarKey, color: locals.user.color }
			: null
	};
};
