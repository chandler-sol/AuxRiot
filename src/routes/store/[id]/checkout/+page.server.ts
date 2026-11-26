import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { ITEM_SELECT, toItem, withBuy, type ItemRow } from '#lib/server/storequery.ts';
import { checkoutLive } from '#lib/server/stripe.ts';
import { startCheckout } from '#lib/server/checkout.ts';
import doc from '#lib/legal/store-license.md?raw';

/**
 * Checkout step for one beat: order summary, legal name and the license
 * agreement, then Stripe. Anything not buyable right now goes back to the beat page.
 */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const env = getEnv();
	const row = await env.DB.prepare(`${ITEM_SELECT} WHERE l.id = ?`).bind(params.id).first<ItemRow>();
	if (!row) error(404, 'This beat is not in the store.');
	const [item] = withBuy([toItem(row)], checkoutLive(env), locals.user.id);
	if (item.buy !== 'buy') redirect(303, `/store/${params.id}`);
	const legal = await env.DB.prepare('SELECT legal_name FROM users WHERE id = ?').bind(locals.user.id).first<{ legal_name: string | null }>();
	// What the license preview needs (the producer signed it when they listed the beat).
	const lic = await env.DB.prepare('SELECT producer_signature, producer_signed_at, sample_disclosure FROM listings WHERE id = ?')
		.bind(params.id)
		.first<{ producer_signature: string | null; producer_signed_at: number | null; sample_disclosure: string | null }>();
	return {
		item,
		stems: url.searchParams.get('stems') === '1' && item.hasStems,
		legalName: legal?.legal_name ?? '',
		license: { doc, producerName: lic?.producer_signature ?? null, producerSignedAt: lic?.producer_signed_at ?? null, samples: lic?.sample_disclosure ?? null }
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, url }) => {
		if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
		const f = await request.formData();
		if (f.get('agree') !== 'on') return fail(400, { error: 'Agree to the Exclusive Beat License to continue.' });
		const r = await startCheckout(getEnv(), locals.user, params.id, {
			stems: f.get('stems') === '1',
			legalName: String(f.get('legal_name') ?? ''),
			origin: url.origin,
			returnPath: `/store/${params.id}`
		});
		if ('error' in r) return fail(400, { error: r.error });
		redirect(303, r.url, { external: true });
	}
};
