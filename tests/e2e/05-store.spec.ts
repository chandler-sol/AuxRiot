import { test, expect } from '@playwright/test';
import { labBattle, one, signup, sql, stripeEvent, uid, eventually } from './helpers';

// Selling and buying: listings, the buy box, Stripe's webhook turning a payment
// into an order, downloads, the license, abandoned checkouts, refunds, chargebacks.
// Stripe itself isn't called: payments arrive as signed webhook events, exactly
// as Stripe sends them.

test('store: buy box, paid order, downloads, license, SOLD', async ({ browser, baseURL }) => {
	const admin = await signup(browser, 'stA', { admin: true });
	const battleId = await labBattle(admin.page, 'Store shelf');
	const l = one<{ id: string; seller_id: string }>(`SELECT id, seller_id FROM listings WHERE battle_id = '${battleId}' AND status = 'listed' LIMIT 1`);
	expect(l, 'the shelf listed a beat').toBeTruthy();

	// Test producers are reused between tests: start from "no payouts" for this battle's sellers.
	sql(`UPDATE users SET payouts_enabled = 0, stripe_account_id = NULL WHERE id IN (SELECT seller_id FROM listings WHERE battle_id = '${battleId}')`);

	// A finished battle shows its store section (this was once missing).
	await admin.page.goto(`/battles/${battleId}`);
	await expect(admin.page.locator('#buy')).toBeVisible();

	// No buying from a producer without payouts.
	await expect(admin.page.locator('#buy')).toContainText(/setting up payouts|checkout opens soon/i);
	sql(`UPDATE users SET payouts_enabled = 1, stripe_account_id = 'acct_robot' WHERE id = '${l.seller_id}'`);
	await admin.page.reload();
	const live = (await admin.page.locator('.buybox summary').count()) > 0;
	if (live) {
		// Checkout is configured: the buy box asks for a legal name and the license.
		await admin.page.locator('.buybox summary').first().click();
		await expect(admin.page.locator('.buyf input[name=legal_name]').first()).toBeVisible();
		await expect(admin.page.locator('.buyf input[name=agree]').first()).toBeVisible();
	} else {
		await expect(admin.page.locator('#buy')).toContainText(/checkout opens soon/i);
	}

	// What startCheckout writes, then Stripe's "paid" event.
	const order = `ord${uid()}`;
	sql(`UPDATE listings SET held_until = ${Date.now() + 1_800_000}, held_by = '${admin.id}' WHERE id = '${l.id}'`);
	sql(
		`INSERT INTO orders (id, listing_id, buyer_id, seller_id, list_price_cents, amount_cents, platform_fee_cents, processing_fee_cents, seller_net_cents, status, buyer_legal_name, buyer_signature, buyer_signed_at, license_version, created_at, stripe_session_id)
		 VALUES ('${order}', '${l.id}', '${admin.id}', '${l.seller_id}', 5000, 5000, 1000, 175, 3825, 'pending', 'Robo <b>Buyer</b>', 'Robo Buyer', ${Date.now()}, 'v', ${Date.now()}, 'cs_${order}')`
	);
	const session = { id: `cs_${order}`, payment_status: 'paid', payment_intent: `pi_${order}`, metadata: { order_id: order }, total_details: { amount_tax: 0 } };
	expect((await stripeEvent(baseURL!, 'checkout.session.completed', session)).status).toBe(200);
	expect((await stripeEvent(baseURL!, 'checkout.session.completed', session)).status).toBe(200); // Stripe retries are harmless
	expect(one(`SELECT status FROM orders WHERE id = '${order}'`)).toEqual({ status: 'paid' });
	expect(one(`SELECT status, held_until FROM listings WHERE id = '${l.id}'`)).toEqual({ status: 'sold', held_until: null });
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${l.seller_id}' AND kind = 'beat_sold'`, 1);

	// The buyer's purchases page, download (makes the sale final) and license.
	await admin.page.goto(`/purchases?order=${order}`);
	await expect(admin.page.locator('.order.hl')).toContainText(/download beat/i);
	const dl = await admin.page.request.get(`/purchases/${order}/download/file`);
	expect(dl.status()).toBe(200);
	expect(dl.headers()['content-disposition']).toContain('attachment');
	expect((await dl.body()).length).toBeGreaterThan(10_000);
	expect(one<{ final: number }>(`SELECT first_download_at IS NOT NULL AS final FROM orders WHERE id = '${order}'`).final).toBe(1);
	await admin.page.goto(`/purchases/${order}/license`);
	const html = await admin.page.locator('.legal').innerHTML();
	expect(html).toContain('&lt;b&gt;Buyer&lt;/b&gt;'); // names are escaped, never rendered as HTML
	expect(html).toContain(order.toUpperCase());

	// The battle wears a SOLD stamp.
	await admin.page.goto(`/battles/${battleId}`);
	await expect(admin.page.locator('#buy .soldtag')).toBeVisible();

	// Admin → Orders: a downloaded sale can't be refunded as "buyer asked" without the override.
	await admin.page.goto('/admin/orders');
	const row = admin.page.locator('.order', { hasText: order.slice(0, 8).toUpperCase() });
	await row.getByRole('button', { name: 'Refund…' }).click();
	await row.locator('input[value=buyer_request]').check();
	await row.getByRole('button', { name: 'Refund in full' }).click();
	await expect(row.locator('.error')).toContainText(/already downloaded/i);
});

test('store: abandoned checkout frees the beat; chargebacks', async ({ browser, baseURL }) => {
	const admin = await signup(browser, 'sdA', { admin: true });
	await labBattle(admin.page, 'Store shelf');
	const ls = sql<{ id: string; seller_id: string }>(`SELECT l.id, l.seller_id FROM listings l JOIN users u ON u.id = l.seller_id WHERE u.is_test = 1 AND l.status = 'listed' LIMIT 2`);

	// Checkout session expires: the hold is released.
	const o1 = `orx${uid()}`;
	sql(`UPDATE listings SET held_until = ${Date.now() + 1_800_000}, held_by = '${admin.id}' WHERE id = '${ls[0].id}'`);
	sql(`INSERT INTO orders (id, listing_id, buyer_id, seller_id, list_price_cents, amount_cents, platform_fee_cents, processing_fee_cents, seller_net_cents, status, created_at) VALUES ('${o1}', '${ls[0].id}', '${admin.id}', '${ls[0].seller_id}', 2000, 2000, 400, 88, 1512, 'pending', ${Date.now()})`);
	expect((await stripeEvent(baseURL!, 'checkout.session.expired', { id: 'cs_x', payment_status: 'unpaid', metadata: { order_id: o1 } })).status).toBe(200);
	expect(one(`SELECT o.status, l.held_until FROM orders o JOIN listings l ON l.id = o.listing_id WHERE o.id = '${o1}'`)).toEqual({ status: 'expired', held_until: null });

	// A chargeback on a paid order: seller and admins told; losing it reverses the sale.
	const o2 = `ord${uid()}`;
	sql(`UPDATE listings SET status = 'sold', buyer_id = '${admin.id}' WHERE id = '${ls[1].id}'`);
	sql(
		`INSERT INTO orders (id, listing_id, buyer_id, seller_id, list_price_cents, amount_cents, platform_fee_cents, processing_fee_cents, seller_net_cents, status, created_at, paid_at, stripe_payment_intent, transfer_reversed)
		 VALUES ('${o2}', '${ls[1].id}', '${admin.id}', '${ls[1].seller_id}', 4000, 4000, 800, 146, 3054, 'paid', ${Date.now()}, ${Date.now()}, 'pi_${o2}', 1)`
	);
	const dispute = { id: 'dp_robot', charge: 'ch_robot', payment_intent: `pi_${o2}`, amount: 4000 };
	expect((await stripeEvent(baseURL!, 'charge.dispute.created', { ...dispute, status: 'needs_response' })).status).toBe(200);
	expect(one<{ dispute_status: string }>(`SELECT dispute_status FROM orders WHERE id = '${o2}'`).dispute_status).toBe('needs_response');
	expect(sql(`SELECT 1 FROM notifications WHERE user_id = '${admin.id}' AND text LIKE 'Chargeback opened%'`).length).toBeGreaterThan(0);
	expect((await stripeEvent(baseURL!, 'charge.dispute.closed', { ...dispute, status: 'lost' })).status).toBe(200);
	expect(one(`SELECT o.status, o.refund_reason, l.status AS listing FROM orders o JOIN listings l ON l.id = o.listing_id WHERE o.id = '${o2}'`)).toEqual({
		status: 'refunded',
		refund_reason: 'dispute_lost',
		listing: 'unlisted'
	});
	await admin.page.goto('/admin/orders?status=disputed');
	await expect(admin.page.locator('.order').first()).toContainText(/chargeback/i);
});
