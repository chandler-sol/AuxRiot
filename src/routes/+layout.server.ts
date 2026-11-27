import type { LayoutServerLoad } from './$types';

import { getEnv } from '#lib/server/util.ts';
import { unreadThreads } from '#lib/server/messages.ts';
import { unfinishedBallots } from '#lib/server/multibeat.ts';
import { unreadNotifications } from '#lib/server/notifications.ts';
import { TERMS_VERSION } from '#lib/server/acceptances.ts';

export const load: LayoutServerLoad = async ({ locals, depends, cookies }) => {
	// The thread page invalidates this after marking a conversation read, so the badge clears.
	depends('app:unread');
	depends('app:notes');
	return {
		unread: locals.user ? await unreadThreads(getEnv().DB, locals.user.id) : 0,
		notes: locals.user ? await unreadNotifications(getEnv().DB, locals.user.id) : 0,
		beta: getEnv().ENVIRONMENT === 'beta',
		// Beta test lab: an admin is browsing as a test producer and can switch back.
		seedReturn: getEnv().ENVIRONMENT === 'beta' && !!cookies.get('seed_return'),
		// Started-but-unfinished multi-beat ballots, for the "finish judging" bar.
		ballots: locals.user ? await unfinishedBallots(getEnv().DB, locals.user.id) : [],
		// Material Terms/Privacy change since they last accepted: show the review notice.
		termsUpdate: locals.user
			? (await getEnv().DB.prepare('SELECT terms_version FROM users WHERE id = ?').bind(locals.user.id).first<{ terms_version: string | null }>())?.terms_version !== TERMS_VERSION
			: false,
		user: locals.user
			? { id: locals.user.id, username: locals.user.username, isAdmin: locals.user.isAdmin, isMod: locals.user.isMod, emailVerified: locals.user.emailVerified, credits: locals.user.credits, avatarKey: locals.user.avatarKey, color: locals.user.color }
			: null
	};
};
