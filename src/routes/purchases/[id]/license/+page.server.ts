import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import doc from '#lib/legal/store-license.md?raw';

/** Escape for both HTML (marked passes raw HTML through) and Markdown table syntax. */
const safe = (s: string | null | undefined) =>
	String(s ?? '')
		.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
		.replace(/([\\|*_`[\]#])/g, '\\$1')
		.replace(/\s+/g, ' ')
		.trim();

/** The signed license for one order: visible to its buyer, its producer, and admins. */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const o = await getEnv()
		.DB.prepare(
			`SELECT o.id, o.buyer_id, o.seller_id, o.status, o.amount_cents, o.includes_stems, o.paid_at, o.buyer_legal_name, o.license_version,
			        l.producer_signature, l.file_format, l.tagged, l.stems_key IS NOT NULL AS has_stems, l.sample_disclosure, b.title, b.rounds, e.round
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN entries e ON e.id = l.entry_id
			 WHERE o.id = ?`
		)
		.bind(params.id)
		.first<{
			id: string; buyer_id: string; seller_id: string; status: string; amount_cents: number; includes_stems: number; paid_at: number | null;
			buyer_legal_name: string | null; license_version: string | null; producer_signature: string | null; file_format: string | null; tagged: number;
			has_stems: number; sample_disclosure: string | null; title: string; rounds: number; round: number;
		}>();
	const u = locals.user;
	if (!o || (o.buyer_id !== u.id && o.seller_id !== u.id && !u.isAdmin)) error(404);
	if (!o.paid_at || (o.status !== 'paid' && o.status !== 'refunded')) error(404, 'This order is not paid yet.');

	const files = [`${(o.file_format ?? 'audio').toUpperCase()} master${o.tagged ? ' (producer tag included)' : ' (untagged)'}`, o.includes_stems && o.has_stems ? 'stems (ZIP)' : '']
		.filter(Boolean)
		.join(' + ');
	const fill: Record<string, string> = {
		producer_name: safe(o.producer_signature),
		buyer_name: safe(o.buyer_legal_name),
		beat_title: safe(o.rounds > 1 ? `${o.title} (round ${o.round})` : o.title),
		price: (o.amount_cents / 100).toFixed(2),
		currency: 'USD',
		date: new Date(o.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
		order_number: o.id.toUpperCase(),
		delivered_files: safe(files),
		sample_disclosures: safe(o.sample_disclosure || 'none')
	};
	const source = doc.replace(/\{(\w+)\}/g, (m, k: string) => (k in fill ? fill[k] : m));
	return { source, refunded: o.status === 'refunded', version: o.license_version, orderId: o.id };
};
