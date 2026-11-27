import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { markDelivered } from '#lib/server/checkout.ts';
import { verifyDelivery } from '#lib/server/deliverylink.ts';

/**
 * Buyer-only private delivery of the purchased audio or stems.
 * Store Terms §6: the exclusive license activates on the first *successful*
 * delivery. A started-but-failed transfer doesn't count, so the order is marked
 * delivered only once the whole file has streamed out (markDelivered).
 */
export const GET: RequestHandler = async ({ params, locals, url, platform }) => {
	const kind = params.kind === 'stems' ? 'stems' : params.kind === 'file' ? 'file' : null;
	if (!kind) error(404);
	const env = getEnv();
	// A signed 7-day link (emailed by admin to a verified buyer who can't sign in) stands in for the login.
	const signed = !locals.user && (await verifyDelivery(env, params.id, kind, url.searchParams.get('e'), url.searchParams.get('t')));
	if (!locals.user && !signed) {
		if (url.searchParams.get('t')) error(410, 'This download link has expired. Email hello@auxriot.com with your order number for a fresh one.');
		redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	}
	const o = await env.DB.prepare(
		`SELECT o.id, o.status, o.paid_at, o.includes_stems, o.blocked_at, o.block_note, l.file_key, l.file_name, l.file_format, l.stems_key, l.stems_name, b.title
		 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id
		 WHERE o.id = ? AND (o.buyer_id = ? OR ?)`
	)
		.bind(params.id, locals.user?.id ?? '', signed ? 1 : 0)
		.first<{ id: string; status: string; paid_at: number | null; includes_stems: number; blocked_at: number | null; block_note: string | null; file_key: string | null; file_name: string | null; file_format: string | null; stems_key: string | null; stems_name: string | null; title: string }>();
	if (!o) error(404);
	if (o.status !== 'paid' || !o.paid_at) error(403, 'This order is not paid, or it was refunded.');
	if (o.blocked_at) error(451, 'These files are temporarily unavailable because of a copyright notice. See your purchases page for your options.');
	if (o.block_note === 'canceling') error(409, 'This order is being canceled.');
	const key = kind === 'stems' ? (o.includes_stems ? o.stems_key : null) : o.file_key;
	if (!key) error(404, 'That file is not part of this order.');
	const obj = await env.AUDIO.get(key);
	if (!obj) error(404, 'File not found. Email hello@auxriot.com with your order number.');

	await env.DB.prepare('UPDATE orders SET download_count = download_count + 1, first_download_at = COALESCE(first_download_at, ?) WHERE id = ?').bind(Date.now(), o.id).run();

	// Count delivery only when every byte has gone out; an aborted download cancels the stream instead.
	const done = new TransformStream<Uint8Array, Uint8Array>({
		flush() {
			const p = markDelivered(env.DB, o.id).catch((e) => console.error('[download] markDelivered', e));
			platform?.ctx?.waitUntil?.(p);
		}
	});
	(obj.body as unknown as ReadableStream<Uint8Array>).pipeTo(done.writable).catch(() => {});

	const base = o.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'beat';
	const ext = kind === 'stems' ? 'zip' : (o.file_format ?? 'mp3');
	return new Response(done.readable, {
		headers: {
			'content-type': kind === 'stems' ? 'application/zip' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg',
			'content-disposition': `attachment; filename="${base}${kind === 'stems' ? '-stems' : ''}.${ext}"`,
			'cache-control': 'private, no-store',
			...(obj.size ? { 'content-length': String(obj.size) } : {})
		}
	});
};
