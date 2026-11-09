import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordListen } from '#lib/server/battles.ts';
import { getEnv } from '#lib/server/util.ts';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) error(401);
	let body: { entryId?: unknown; playedMs?: unknown };
	try {
		body = await request.json();
	} catch {
		error(400);
	}
	if (typeof body.entryId !== 'string' || typeof body.playedMs !== 'number') error(400);
	const res = await recordListen(getEnv(platform).DB, locals.user.id, body.entryId, Math.max(0, Math.floor(body.playedMs)));
	if (!res) error(404);
	return json(res);
};
