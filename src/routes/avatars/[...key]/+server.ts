import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';

/** Serves profile pictures from R2. Keys are random and never reused, so they cache forever. */
export const GET: RequestHandler = async ({ params, platform }) => {
	const key = `avatars/${params.key}`;
	if (!/^avatars\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(key)) error(404);
	const obj = await getEnv(platform).AUDIO.get(key);
	if (!obj) error(404);
	const headers = new Headers();
	obj.writeHttpMetadata(headers as never);
	headers.set('etag', obj.httpEtag);
	headers.set('cache-control', 'public, max-age=31536000, immutable');
	headers.set('x-content-type-options', 'nosniff');
	return new Response(obj.body as unknown as ReadableStream, { headers });
};
