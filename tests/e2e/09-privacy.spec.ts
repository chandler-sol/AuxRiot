import { test, expect } from '@playwright/test';
import { eventually, expectNoHorizontalScroll, one, signup, sql, uid } from './helpers';

// Privacy and safety promises in the v5 Terms and Privacy Policy: private-image removal
// (no account, 48-hour clock), cookie choices, the private-message notice, seller statements,
// and signed 7-day download links for a buyer who can't sign in.

test('private image removal: anyone can ask; admins get a 48-hour queue', async ({ browser, baseURL }) => {
	const admin = await signup(browser, 'rmA', { admin: true });
	// A visitor with no account (beta password only).
	const ctx = await browser.newContext({ baseURL });
	const page = await ctx.newPage();
	await page.goto('/');
	await page.fill('input[name=password]', 'local-test-pw');
	await page.click('button');
	await page.goto('/report-image');
	await expect(page.locator('h1')).toHaveText(/remove a private image/i);
	await expect(page.locator('body')).toContainText(/don't send us a copy/i);
	const where = `https://beta.auxriot.com/u/robot-${uid()}`;
	await page.locator('#location').fill(where);
	await page.locator('#details').fill('Posted as an avatar without my consent.');
	await page.locator('#contact').fill('robot@example.test');
	await page.locator('input[name=good_faith]').check();
	await page.locator('#signature').fill('Robo Person');
	await page.getByRole('button', { name: /send removal request/i }).click();
	await expect(page.locator('.success')).toContainText(/received/i);
	const r = one<{ id: string; due: number }>(`SELECT id, due_at - created_at AS due FROM removal_requests WHERE location = '${where}'`);
	expect(r.due).toBe(48 * 3_600_000);
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${admin.id}' AND text LIKE 'URGENT: private image removal%'`, 1);

	await admin.page.goto('/admin/removals');
	const row = admin.page.locator('.req', { hasText: where });
	await expect(row).toContainText(/h left/);
	await row.getByRole('button', { name: 'Removed' }).click();
	await expect(admin.page.locator('.success')).toContainText(/marked removed/i);
	expect(one(`SELECT status FROM removal_requests WHERE id = '${r.id}'`)).toEqual({ status: 'removed' });
	await ctx.close();
});

test('cookie choices, message notice, seller statements, signed download links', async ({ browser, baseURL }) => {
	const u = await signup(browser, 'ckU');
	// Cookies page: view counting can be turned off and on.
	await u.page.goto('/cookies');
	await u.page.getByRole('button', { name: 'Turn it off' }).click();
	await expect(u.page.locator('.success')).toContainText(/off/i);
	expect((await u.page.context().cookies()).find((c) => c.name === 'view_consent')?.value).toBe('no');
	await u.page.getByRole('button', { name: 'Allow view counting' }).click();
	await expect.poll(async () => (await u.page.context().cookies()).find((c) => c.name === 'view_consent')?.value).toBe('yes');

	// Seller statements: a month with a sale and a refund adjustment.
	const l = one<{ id: string; seller_id: string }>(`SELECT l.id, l.seller_id FROM listings l JOIN users s ON s.id = l.seller_id WHERE s.is_test = 1 LIMIT 1`);
	const o = `ors${uid()}`;
	sql(
		`INSERT INTO orders (id, listing_id, buyer_id, seller_id, list_price_cents, amount_cents, platform_fee_cents, processing_fee_cents, seller_net_cents, status, created_at, paid_at, refunded_at, refund_reason, refund_breakdown)
		 VALUES ('${o}', '${l.id}', '${u.id}', '${u.id}', 10000, 10000, 2000, 320, 7680, 'refunded', ${Date.now()}, ${Date.now()}, ${Date.now()}, 'buyer_cancel', '{"sellerReturnsCents":7680,"processingBorneBySellerCents":320,"restoredToSellerCents":0}')`
	);
	await u.page.goto('/settings/payouts/statements');
	const month = u.page.locator('.month').first();
	await expect(month).toContainText('Gross sales');
	await expect(month).toContainText('$100.00');
	await expect(month).toContainText('−$80.00'); // seller returns $76.80 net and carries $3.20 processing
	await expectNoHorizontalScroll(u.page);

	// The private-message composer explains the automated checks before sending.
	await u.page.goto(`/messages/new?listing=${l.id}`);
	await expect(u.page.locator('main form.stack')).toContainText(/automated checks flag phone numbers/i);

	// Signed 7-day links work without signing in; a tampered one doesn't.
	const paid = `orl${uid()}`;
	sql(
		`INSERT INTO orders (id, listing_id, buyer_id, seller_id, list_price_cents, amount_cents, platform_fee_cents, processing_fee_cents, seller_net_cents, status, created_at, paid_at, files_available_at)
		 VALUES ('${paid}', '${l.id}', '${u.id}', '${l.seller_id}', 2000, 2000, 400, 88, 1512, 'paid', ${Date.now()}, ${Date.now()}, ${Date.now()})`
	);
	const admin = await signup(browser, 'ckA', { admin: true });
	await admin.page.goto('/admin/orders');
	const row = admin.page.locator('.order', { hasText: paid.slice(0, 8).toUpperCase() });
	await row.getByRole('button', { name: 'Email download links' }).click();
	await expect(admin.page.locator('.success')).toContainText(/download links/i);
	expect(sql(`SELECT 1 FROM mod_log WHERE action = 'order.send_links' AND target_id = '${paid}'`).length).toBe(1);
	const anon = await (await browser.newContext({ baseURL })).newPage();
	await anon.goto('/');
	await anon.fill('input[name=password]', 'local-test-pw');
	await anon.click('button');
	expect((await anon.request.get(`/purchases/${paid}/download/file?e=${Date.now() + 86_400_000}&t=forged`, { maxRedirects: 0 })).status()).toBe(410);
});
