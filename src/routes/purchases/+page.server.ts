import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { downloadOpenUntil } from '#lib/server/checkout.ts';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	depends('app:purchases');
	const rows = await getEnv()
		.DB.prepare(
			`SELECT o.id, o.status, o.amount_cents, o.tax_cents, o.includes_stems, o.paid_at, o.created_at, o.download_count, o.first_download_at,
			        l.file_format, l.stems_key IS NOT NULL AS has_stems, b.id AS battle_id, b.title, u.username AS seller
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN users u ON u.id = o.seller_id
			 WHERE o.buyer_id = ? AND (o.status IN ('paid', 'refunded') OR o.id = ?)
			 ORDER BY o.created_at DESC LIMIT 100`
		)
		.bind(locals.user.id, url.searchParams.get('order') ?? '')
		.all<{
			id: string; status: string; amount_cents: number; tax_cents: number; includes_stems: number; paid_at: number | null; created_at: number;
			download_count: number; first_download_at: number | null; file_format: string | null; has_stems: number; battle_id: string; title: string; seller: string;
		}>();
	const now = Date.now();
	return {
		highlight: url.searchParams.get('order'),
		orders: rows.results.map((o) => ({
			...o,
			openUntil: o.paid_at ? downloadOpenUntil(o.paid_at) : null,
			canDownload: o.status === 'paid' && !!o.paid_at && now < downloadOpenUntil(o.paid_at)
		}))
	};
};
