import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';

/** Streams audio from R2 with HTTP Range support so playback starts instantly and seeking is cheap. */
export const GET: RequestHandler = async ({ params, request, platform }) => {
	const key = params.key;
	if (!/^beats\/[A-Za-z0-9_-]+\.mp3$/.test(key)) error(404);
	const bucket = getEnv(platform).AUDIO;

	const obj = await bucket.get(key, { range: request.headers as never, onlyIf: request.headers as never });
	if (!obj) error(404);

	const headers = new Headers();
	obj.writeHttpMetadata(headers as never);
	headers.set('etag', obj.httpEtag);
	headers.set('accept-ranges', 'bytes');
	headers.set('cache-control', 'public, max-age=31536000, immutable');

	if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });

	const range = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
	if (range && request.headers.has('range')) {
		const offset = range.offset ?? (range.suffix ? obj.size - range.suffix : 0);
		const length = range.length ?? obj.size - offset;
		headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
		headers.set('content-length', String(length));
		return new Response(obj.body as unknown as ReadableStream, { status: 206, headers });
	}
	headers.set('content-length', String(obj.size));
	return new Response(obj.body as unknown as ReadableStream, { headers });
};
