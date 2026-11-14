import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { rememberCrew, verifiedCreator } from '#lib/server/crews.ts';

/** A verified creator's crew link: remember who sent them, then sign up (or see the creator). */
export const GET: RequestHandler = async ({ params, cookies, locals, url }) => {
	const creator = await verifiedCreator(getEnv().DB, params.username);
	if (!creator) redirect(303, `/u/${encodeURIComponent(params.username)}`);
	if (locals.user) redirect(303, `/u/${creator.username}#crew`);
	rememberCrew(cookies, creator.id, url.protocol === 'https:');
	redirect(303, `/signup?crew=${encodeURIComponent(creator.username)}`);
};
