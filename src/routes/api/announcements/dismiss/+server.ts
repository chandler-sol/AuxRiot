import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { dismissAnnouncement } from '#lib/server/announcements.ts';

/** Close an announcement for good (this visitor never sees it again). */
export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
	const { id } = (await request.json().catch(() => ({}))) as { id?: string };
	if (typeof id !== 'string') return json({ ok: false }, { status: 400 });
	await dismissAnnouncement(getEnv().DB, id, locals.user?.id ?? null, cookies, url.protocol === 'https:');
	return json({ ok: true });
};
