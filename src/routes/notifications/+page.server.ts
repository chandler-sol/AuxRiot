import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { listNotifications, markRead } from '#lib/server/notifications.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const db = getEnv().DB;
	// Show what was unread on this visit, then mark everything read (the bell clears).
	const items = await listNotifications(db, locals.user.id);
	await markRead(db, locals.user.id);
	return { items };
};

export const actions: Actions = {
	/** Mark read from elsewhere (e.g. after opening one in a new tab). */
	read: async ({ locals }) => {
		if (locals.user) await markRead(getEnv().DB, locals.user.id);
		return { ok: true };
	}
};
