import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import doc from '#lib/legal/store-license.md?raw';
import { deliveredFiles, fillLicense } from '#lib/license.ts';

/** The signed license for one order: visible to its buyer, its producer, and admins. */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const o = await getEnv()
		.DB.prepare(
			`SELECT o.id, o.buyer_id, o.seller_id, o.status, o.amount_cents, o.includes_stems, o.paid_at, o.buyer_legal_name, o.buyer_signed_at, o.license_version,
			        l.producer_signature, l.producer_signed_at, l.file_format, l.tagged, l.stems_key IS NOT NULL AS has_stems, l.sample_disclosure, b.title, b.rounds, e.round
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN entries e ON e.id = l.entry_id
			 WHERE o.id = ?`
		)
		.bind(params.id)
		.first<{
			id: string; buyer_id: string; seller_id: string; status: string; amount_cents: number; includes_stems: number; paid_at: number | null;
			buyer_legal_name: string | null; buyer_signed_at: number | null; license_version: string | null; producer_signature: string | null; producer_signed_at: number | null;
			file_format: string | null; tagged: number; has_stems: number; sample_disclosure: string | null; title: string; rounds: number; round: number;
		}>();
	const u = locals.user;
	if (!o || (o.buyer_id !== u.id && o.seller_id !== u.id && !u.isAdmin)) error(404);
	if (!o.paid_at || (o.status !== 'paid' && o.status !== 'refunded')) error(404, 'This order is not paid yet.');

	const source = fillLicense(doc, {
		producerName: o.producer_signature,
		producerSignedAt: o.producer_signed_at,
		buyerName: o.buyer_legal_name,
		buyerSignedAt: o.buyer_signed_at ?? o.paid_at,
		beatTitle: o.rounds > 1 ? `${o.title} (round ${o.round})` : o.title,
		priceCents: o.amount_cents,
		saleDate: o.paid_at,
		orderNumber: o.id.toUpperCase(),
		deliveredFiles: deliveredFiles(o.file_format, !!o.tagged, !!(o.includes_stems && o.has_stems)),
		samples: o.sample_disclosure
	});
	return { source, refunded: o.status === 'refunded', version: o.license_version, orderId: o.id };
};
