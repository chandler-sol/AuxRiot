import { test, expect } from '@playwright/test';
import { one, signup, sql, uid } from './helpers';

// Announcement pop-ups: admin publishes one; each person sees it once and, once closed,
// never again (on the account when signed in, by cookie when signed out).

test('announcement shows once and stays dismissed', async ({ browser, baseURL }) => {
	// Only this test's announcement should be live.
	sql(`UPDATE announcements SET active = 0`);
	const admin = await signup(browser, 'anA', { admin: true });
	const title = `Store is open ${uid()}`;
	await admin.page.goto('/admin/announcements');
	await admin.page.locator('#title').fill(title);
	await admin.page.locator('#body').fill('Exclusive beats from the battles.\n\nOne buyer each.');
	await admin.page.locator('#button_label').fill('Browse beats');
	await admin.page.locator('#button_url').fill('/store');
	await admin.page.getByRole('button', { name: 'Publish' }).click();
	await expect(admin.page.locator('.success')).toContainText(/live/i);
	const id = one<{ id: string }>(`SELECT id FROM announcements WHERE title = '${title}'`).id;

	// A signed-in user: sees it, closes it with Esc, and it doesn't come back.
	const u = await signup(browser, 'anU');
	await u.page.goto('/battles');
	const modal = u.page.getByRole('dialog');
	await expect(modal).toContainText(title);
	await expect(modal.locator('.body')).toHaveCount(2);
	await u.page.keyboard.press('Escape');
	await expect(modal).toHaveCount(0);
	await expect.poll(() => sql(`SELECT 1 FROM announcement_dismissals WHERE announcement_id = '${id}' AND user_id = '${u.id}'`).length).toBe(1);
	await u.page.reload();
	await u.page.waitForTimeout(1200);
	await expect(u.page.getByRole('dialog')).toHaveCount(0);

	// A signed-out visitor: closes it with ✕; the cookie remembers.
	const ctx = await browser.newContext({ baseURL });
	const v = await ctx.newPage();
	await v.goto('/');
	await v.fill('input[name=password]', 'local-test-pw');
	await v.click('button');
	await v.goto('/store');
	await expect(v.getByRole('dialog')).toContainText(title);
	await v.getByRole('button', { name: 'Close' }).click();
	await expect(v.getByRole('dialog')).toHaveCount(0);
	await v.waitForTimeout(500);
	await v.reload();
	await v.waitForTimeout(1200);
	await expect(v.getByRole('dialog')).toHaveCount(0);
	await ctx.close();

	// Switched off: nobody sees it.
	await admin.page.goto('/admin/announcements');
	await admin.page.locator('.ann', { hasText: title }).getByRole('button', { name: 'Switch off' }).click();
	await expect(admin.page.locator('.success')).toContainText(/switched off/i);
	expect(one(`SELECT active FROM announcements WHERE id = '${id}'`)).toEqual({ active: 0 });
});
