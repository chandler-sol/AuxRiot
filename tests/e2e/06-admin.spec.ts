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
	await page.locator('.rows li', { has: page.locator(`a[href="/battles/${id}"]`) }).getByRole('button', { name: 'End voting now' }).click();
	await expect.poll(() => one<{ status: string }>(`SELECT status FROM battles WHERE id = '${id}'`).status).toBe('closed');
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${admin.id}' AND kind = 'battle_result'`, 1);
});
