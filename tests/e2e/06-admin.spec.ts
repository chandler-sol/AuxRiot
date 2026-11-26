import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll, one, signup, sql, eventually } from './helpers';

// Admin tools on a phone: the users list fits, the menu works, verifying is one tap.

test('admin users: cards fit, verify panel, credits', async ({ browser }) => {
	const target = await signup(browser, 'tgt');
	// A very long email used to push the actions menu off screen.
	sql(`UPDATE users SET email = 'an.extremely.long.email.address.for.testing.${target.name}@robot.test' WHERE id = '${target.id}'`);
	const admin = await signup(browser, 'adm', { admin: true });
	const page = admin.page;
	await page.goto(`/admin/users?q=${target.name}`);
	await expectNoHorizontalScroll(page);
	const card = page.locator('li.user', { hasText: target.name }).first();
	const menu = await card.locator('.more summary').boundingBox();
	expect(menu!.x + menu!.width, 'menu button stays on screen').toBeLessThanOrEqual(page.viewportSize()!.width);

	// Verify with one tap, then remove.
	await card.locator('.more summary').click();
	await card.getByRole('button', { name: 'Verify…' }).click();
	await card.getByRole('button', { name: 'Streamer' }).click();
	await expect.poll(() => one<{ v: string | null }>(`SELECT verified_label AS v FROM users WHERE id = '${target.id}'`).v).toBe('Streamer');
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${target.id}' AND kind = 'verified'`, 1);
	await card.locator('.more summary').click();
	await card.getByRole('button', { name: /Verified: Streamer/ }).click();
	await card.getByRole('button', { name: 'Remove verification' }).click();
	await expect.poll(() => one<{ v: string | null }>(`SELECT verified_label AS v FROM users WHERE id = '${target.id}'`).v).toBeNull();

	// Give credits: they land in the ledger and the bell.
	await card.locator('.more summary').click();
	await card.getByRole('button', { name: 'Give credits' }).click();
	await card.getByRole('button', { name: '+250' }).click();
	await expect.poll(() => one<{ credits: number }>(`SELECT credits FROM users WHERE id = '${target.id}'`).credits).toBeGreaterThanOrEqual(250);
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${target.id}' AND kind = 'credits_granted'`, 1);
});

test('test lab builds a live battle and fast-forwards it', async ({ browser }) => {
	const admin = await signup(browser, 'lab', { admin: true });
	const page = admin.page;
	await page.goto('/admin/seed');
	await page.getByRole('button', { name: 'Someone answered me' }).click();
	await page.waitForFunction(() => !document.querySelector('.log .spin'), null, { timeout: 180_000 });
	const id = ((await page.locator('.log p.ok').first().textContent()) ?? '').match(/battles\/(\S+)/)![1];
	expect(one(`SELECT status FROM battles WHERE id = '${id}'`)).toEqual({ status: 'voting' });
	await page.reload();
	// The lab fits a phone: no sideways scroll, and each producer row keeps its button on the same line.
	await expectNoHorizontalScroll(page);
	for (const row of await page.locator('.people li').all()) expect((await row.boundingBox())!.height, 'producer row on one line').toBeLessThan(80);
	await page.locator('.rows li', { has: page.locator(`a[href="/battles/${id}"]`) }).getByRole('button', { name: 'End voting now' }).click();
	await expect.poll(() => one<{ status: string }>(`SELECT status FROM battles WHERE id = '${id}'`).status).toBe('closed');
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${admin.id}' AND kind = 'battle_result'`, 1);
});

test('test lab: services market, then wipe removes everything cleanly', async ({ browser }) => {
	const admin = await signup(browser, 'svc', { admin: true });
	const page = admin.page;
	await page.goto('/admin/seed');
	await page.getByRole('button', { name: 'List services' }).click();
	await page.waitForFunction(() => !document.querySelector('.log .spin'));
	await expect(page.locator('.log .ok').first()).toContainText(/listed \d+ services/i);
	const made = one<{ n: number; withSamples: number }>(
		`SELECT COUNT(*) AS n, SUM(EXISTS (SELECT 1 FROM service_samples x WHERE x.service_id = s.id)) AS withSamples FROM services s JOIN users u ON u.id = s.user_id WHERE u.is_test = 1`
	);
	expect(made.n).toBeGreaterThan(0);
	expect(made.withSamples, 'services have samples (earlier tests made beats)').toBeGreaterThan(0);
	await page.goto('/services');
	await expectNoHorizontalScroll(page);
	expect(await page.locator('main a[href*="#services"], main .svc, main article').count()).toBeGreaterThan(0);

	// Wipe: every test account and everything they touched goes, with no broken links left.
	await page.goto('/admin/seed');
	await page.fill('input[placeholder="Type WIPE"]', 'WIPE');
	await page.getByRole('button', { name: 'Wipe' }).click();
	await page.waitForFunction(() => !document.querySelector('.log .spin'), null, { timeout: 120_000 });
	await expect(page.locator('.log .ok').first()).toContainText(/wiped/i);
	expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE is_test = 1`).n).toBe(0);
	expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM services s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL`).n).toBe(0);
	expect(sql('PRAGMA foreign_key_check').length, 'no broken links after wipe').toBe(0);
});
