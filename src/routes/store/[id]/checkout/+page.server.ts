import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { ITEM_SELECT, toItem, withBuy, type ItemRow } from '#lib/server/storequery.ts';
import { checkoutLive } from '#lib/server/stripe.ts';
import { startCheckout } from '#lib/server/checkout.ts';
import { STORE_DOCS_VERSION } from '#lib/server/store.ts';
import { merchantInfo } from '#lib/server/merchant.ts';
import { partyLine } from '#lib/server/acceptances.ts';
import { parseRights, rightsText } from '#lib/signing.ts';
import { fileLine } from '#lib/license.ts';
import doc from '#lib/legal/store-license.md?raw';

/**
 * Checkout for one beat: the order, the license (key points + the full text filled in
 * live), then the v5 signature and Stripe. Anything not buyable goes back to the beat page.
 */
export const load: PageServerLoad = async ({ params, locals, url, request }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const env = getEnv();
	const row = await env.DB.prepare(`${ITEM_SELECT} WHERE l.id = ?`).bind(params.id).first<ItemRow>();
	if (!row) error(404, 'This beat is not in the store.');
	const [item] = withBuy([toItem(row)], checkoutLive(env), locals.user.id);
	if (item.buy !== 'buy') redirect(303, `/store/${params.id}`);
	const legal = await env.DB.prepare('SELECT legal_name FROM users WHERE id = ?').bind(locals.user.id).first<{ legal_name: string | null }>();
	const l = await env.DB.prepare(
		`SELECT entry_id, producer_signature, producer_signed_at, producer_capacity, producer_entity, producer_credit, producer_acceptance_id, listing_version,
		        rights_schedule, file_name, file_size, file_format, tagged, stems_name
		 FROM listings WHERE id = ?`
	)
		.bind(params.id)
		.first<{
			entry_id: string; producer_signature: string | null; producer_signed_at: number | null; producer_capacity: string | null; producer_entity: string | null;
			producer_credit: string | null; producer_acceptance_id: string | null; listing_version: number; rights_schedule: string | null;
			file_name: string | null; file_size: number | null; file_format: string | null; tagged: number; stems_name: string | null;
		}>();
	if (!l) error(404);
	const merchant = await merchantInfo(env.DB);
	const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? null;
	return {
		item,
		stems: url.searchParams.get('stems') === '1' && item.hasStems,
		legalName: legal?.legal_name ?? '',
		merchant,
		outsideUS: !!country && country !== 'US' && country !== 'XX',
		license: {
			doc,
			version: STORE_DOCS_VERSION,
			producerName: l.producer_signature,
			producerParty: partyLine(l.producer_signature, l.producer_capacity, l.producer_entity),
			producerCapacity: l.producer_capacity,
			producerSignedAt: l.producer_signed_at,
			producerAcceptanceId: l.producer_acceptance_id,
			credit: l.producer_credit ?? item.seller.username,
			listingVersion: l.listing_version,
			rights: rightsText(parseRights(l.rights_schedule)),
			file: fileLine(l.file_name, l.file_format, !!l.tagged, l.file_size),
			stemsFile: l.stems_name,
			previewId: `entry ${l.entry_id}`
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, url }) => {
		if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
		const f = await request.formData();
		const forEntity = f.get('signing_as') === 'entity';
		const r = await startCheckout(getEnv(), locals.user, params.id, {
			stems: f.get('stems') === '1',
			legalName: String(f.get('legal_name') ?? ''),
			entity: forEntity ? String(f.get('entity') ?? '') : '',
			capacity: forEntity ? String(f.get('capacity') ?? '') : 'self',
			agreed: f.get('agree') === 'on',
			recordsConsent: f.get('records') === 'on',
			country: (request as Request & { cf?: { country?: string } }).cf?.country ?? null,
			request,
			origin: url.origin,
			returnPath: `/store/${params.id}`
		});
		if ('error' in r) return fail(400, { error: r.error });
		redirect(303, r.url, { external: true });
	}
};
