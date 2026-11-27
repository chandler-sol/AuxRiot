import { test, expect } from '@playwright/test';
import { eventually, labBattle, one, signup, sql, uid } from './helpers';

// Store Terms v5: a paid order reserves the beat; the license activates on the first
// completed delivery. Before that the buyer can cancel; after 14 days without a
// download the order refunds itself; a copyright block refunds on request or at a
// business-day deadline. Refund costs follow Store Terms §8. The robot's placeholder
// Stripe key answers money movements like Stripe would (no real Stripe calls).

const DAY = 86_400_000;

/** A paid, undelivered order on one of the shelf's beats (what the webhook would leave behind). */
function paidOrder(buyerId: string, opts: { availableAgo?: number } = {}) {
	const l = one<{ id: string; seller_id: string }>(
		`SELECT l.id, l.seller_id FROM listings l JOIN users u ON u.id = l.seller_id WHERE u.is_test = 1 AND l.status = 'listed' AND l.seller_id != '${buyerId}' ORDER BY l.created_at DESC LIMIT 1`
	);
	expect(l, 'a listed test beat').toBeTruthy();
	const id = `orv${uid()}`;
	const paid = Date.now() - (opts.availableAgo ?? 0);
	sql(`UPDATE listings SET status = 'sold', buyer_id = '${buyerId}', sold_at = NULL, producer_signed_at = ${Date.now()} WHERE id = '${l.id}'`);
	sql(
		`INSERT INTO orders (id, listing_id, buyer_id, seller_id, list_price_cents, amount_cents, platform_fee_cents, processing_fee_cents, seller_net_cents, status, created_at, paid_at, files_available_at, stripe_payment_intent, buyer_legal_name)
		 VALUES ('${id}', '${l.id}', '${buyerId}', '${l.seller_id}', 10000, 10000, 2000, 320, 7680, 'paid', ${paid}, ${paid}, ${paid}, 'pi_${id}', 'Rule Tester')`
	);
	return { id, listingId: l.id, sellerId: l.seller_id };
}

const cron = (baseURL: string) => fetch(`${baseURL}/cdn-cgi/local/scheduled`);

test('store rules: cancel before delivery, 14-day expiry, reminders', async ({ browser, baseURL }) => {
	const admin = await signup(browser, 'srA', { admin: true });
	await labBattle(admin.page, 'Store shelf');

	// Cancel before delivery: full refund; seller carries processing ($3.20 of $100); beat unlisted and must be signed again.
	const a = paidOrder(admin.id);
	await admin.page.goto(`/purchases?order=${a.id}`);
	// (after a form action the ?order= highlight drops, so find the card by its order number)
	const card = admin.page.locator('.order', { hasText: a.id.slice(0, 8).toUpperCase() });
	await card.getByRole('button', { name: /cancel for a full refund/i }).click();
	await card.getByRole('button', { name: /yes, cancel/i }).click();
	await expect(card).toContainText(/canceled before downloading/i);
	const ra = one<{ status: string; refund_reason: string; refund_fault: string; refund_breakdown: string }>(`SELECT status, refund_reason, refund_fault, refund_breakdown FROM orders WHERE id = '${a.id}'`);
	expect([ra.status, ra.refund_reason, ra.refund_fault]).toEqual(['refunded', 'buyer_cancel', 'ordinary']);
	expect(JSON.parse(ra.refund_breakdown)).toMatchObject({ refundedToBuyerCents: 10000, sellerReturnsCents: 7680, processingBorneBySellerCents: 320, feeReturnedByAuxRiotCents: 2000 });
	expect(one(`SELECT status, producer_signed_at FROM listings WHERE id = '${a.listingId}'`)).toEqual({ status: 'unlisted', producer_signed_at: null });
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${a.sellerId}' AND text LIKE '%buyer canceled before downloading%' AND text LIKE '%sign the listing again%'`, 1);

	// Nothing downloaded for 14 days: the cron cancels and refunds. At 11 days: one reminder.
	const b = paidOrder(admin.id, { availableAgo: 15 * DAY });
	const c = paidOrder(admin.id, { availableAgo: 11.5 * DAY });
	expect((await cron(baseURL!)).ok).toBe(true);
	await expect.poll(() => one<{ status: string }>(`SELECT status FROM orders WHERE id = '${b.id}'`).status, { timeout: 15_000 }).toBe('refunded');
	expect(one(`SELECT refund_reason FROM orders WHERE id = '${b.id}'`)).toEqual({ refund_reason: 'expired' });
	await expect.poll(() => one<{ r: number }>(`SELECT expiry_reminded_at IS NOT NULL AS r FROM orders WHERE id = '${c.id}'`).r, { timeout: 15_000 }).toBe(1);
	expect(one(`SELECT status FROM orders WHERE id = '${c.id}'`)).toEqual({ status: 'paid' });
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${admin.id}' AND text LIKE 'Download %or the order is canceled%'`, 1);
});

test('store rules: copyright block, refund on request or at the deadline; delivered beats never relist', async ({ browser }) => {
	const admin = await signup(browser, 'scA', { admin: true });
	await labBattle(admin.page, 'Store shelf');

	// Admin blocks an order's files: deadline is 5 p.m. ET on the 14th business day (≥ 18 calendar days out).
	const o = paidOrder(admin.id);
	await admin.page.goto('/admin/orders');
	const row = admin.page.locator('.order', { hasText: o.id.slice(0, 8).toUpperCase() });
	await row.getByRole('button', { name: 'Copyright block…' }).click();
	await row.locator('input[name=note]').fill('Robot Records, notice dated today');
	await row.locator('input[name=strike]').check();
	await row.getByRole('button', { name: 'Block files' }).click();
	await expect(admin.page.locator('.success')).toContainText(/files blocked/i);
	const blk = one<{ blocked_at: number; block_deadline: number }>(`SELECT blocked_at, block_deadline FROM orders WHERE id = '${o.id}'`);
	expect(blk.block_deadline - blk.blocked_at).toBeGreaterThan(17 * DAY);
	expect(one(`SELECT copyright_strikes FROM users WHERE id = '${o.sellerId}'`)).toMatchObject({ copyright_strikes: expect.any(Number) });

	// Downloads are closed while blocked; the buyer sees the deadline and can refund at once.
	expect((await admin.page.request.get(`/purchases/${o.id}/download/file`)).status()).toBe(451);
	await admin.page.goto(`/purchases?order=${o.id}`);
	const card = admin.page.locator('.order', { hasText: o.id.slice(0, 8).toUpperCase() });
	await expect(card).toContainText(/temporarily unavailable/i);
	await expect(card).toContainText(/5 p\.m\. Eastern time/);
	await card.getByRole('button', { name: /refund me now/i }).click();
	await expect(card).toContainText(/copyright notice blocked/i);
	expect(one(`SELECT refund_reason, refund_fault FROM orders WHERE id = '${o.id}'`)).toEqual({ refund_reason: 'copyright_block', refund_fault: 'auxriot' });
	expect(one(`SELECT status FROM listings WHERE id = '${o.listingId}'`)).toEqual({ status: 'removed' });

	// Restored before the deadline: the order simply continues.
	const p = paidOrder(admin.id);
	sql(`UPDATE orders SET blocked_at = ${Date.now()}, block_deadline = ${Date.now() + 20 * DAY}, block_note = 'test' WHERE id = '${p.id}'`);
	await admin.page.goto('/admin/orders');
	const prow = admin.page.locator('.order', { hasText: p.id.slice(0, 8).toUpperCase() });
	await prow.getByRole('button', { name: 'Restore access' }).click();
	await expect(admin.page.locator('.success')).toContainText(/access restored/i);
	expect(one(`SELECT status, blocked_at FROM orders WHERE id = '${p.id}'`)).toEqual({ status: 'paid', blocked_at: null });

	// A delivered sale refunded for a defect: the beat can never be sold again.
	const d = paidOrder(admin.id);
	sql(`UPDATE orders SET delivered_at = ${Date.now()}, first_download_at = ${Date.now()} WHERE id = '${d.id}'`);
	await admin.page.reload();
	const drow = admin.page.locator('.order', { hasText: d.id.slice(0, 8).toUpperCase() });
	await drow.getByRole('button', { name: 'Refund…' }).click();
	await drow.locator('input[name=reason][value=defect]').check();
	await drow.getByRole('button', { name: 'Refund in full' }).click();
	await expect(admin.page.locator('.success')).toContainText(/itemized notice/i);
	expect(one(`SELECT status FROM listings WHERE id = '${d.listingId}'`)).toEqual({ status: 'removed' });
});
