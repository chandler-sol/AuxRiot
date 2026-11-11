import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		user: locals.user
			? { id: locals.user.id, username: locals.user.username, isAdmin: locals.user.isAdmin, emailVerified: locals.user.emailVerified, credits: locals.user.credits, avatarKey: locals.user.avatarKey, color: locals.user.color }
			: null
	};
};
