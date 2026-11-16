import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { downloadOpenUntil } from '#lib/server/checkout.ts';

/**
 * Buyer-only file download, open for 7 days after payment. The first audio or
 * stems download makes the sale final (Store Terms §7).
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const kind = params.kind === 'stems' ? 'stems' : params.kind === 'file' ? 'file' : null;
	if (!kind) error(404);
	const env = getEnv();
	const o = await env.DB.prepare(
		`SELECT o.id, o.status, o.paid_at, o.includes_stems, l.file_key, l.file_name, l.file_format, l.stems_key, l.stems_name, b.title
		 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id
		 WHERE o.id = ? AND o.buyer_id = ?`
	)
		.bind(params.id, locals.user.id)
		.first<{ id: string; status: string; paid_at: number | null; includes_stems: number; file_key: string | null; file_name: string | null; file_format: string | null; stems_key: string | null; stems_name: string | null; title: string }>();
	if (!o) error(404);
	if (o.status !== 'paid' || !o.paid_at) error(403, 'This order is not paid, or it was refunded.');
	if (Date.now() > downloadOpenUntil(o.paid_at)) error(410, 'The 7-day download window has closed. Email hello@auxriot.com with your order number.');
	const key = kind === 'stems' ? (o.includes_stems ? o.stems_key : null) : o.file_key;
	if (!key) error(404, 'That file is not part of this order.');
	const obj = await env.AUDIO.get(key);
	if (!obj) error(404, 'File not found. Email hello@auxriot.com with your order number.');

	await env.DB.prepare('UPDATE orders SET download_count = download_count + 1, first_download_at = COALESCE(first_download_at, ?) WHERE id = ?').bind(Date.now(), o.id).run();

	const base = o.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'beat';
	const ext = kind === 'stems' ? 'zip' : (o.file_format ?? 'mp3');
	return new Response(obj.body as unknown as ReadableStream, {
		headers: {
			'content-type': kind === 'stems' ? 'application/zip' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg',
			'content-disposition': `attachment; filename="${base}${kind === 'stems' ? '-stems' : ''}.${ext}"`,
			'cache-control': 'private, no-store',
			...(obj.size ? { 'content-length': String(obj.size) } : {})
		}
	});
};
