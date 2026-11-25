import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll, guest, signup } from './helpers';

// Every main page loads, throws no browser errors, and fits a phone screen.

const PUBLIC = ['/', '/battles', '/store', '/services', '/rules', '/faq', '/credits', '/signup', '/login', '/store/terms', '/store/license', '/dmca', '/terms', '/privacy'];
const SIGNED_IN = ['/notifications', '/purchases', '/settings/payouts', '/settings/profile', '/messages', '/battles/new'];

test('public pages load and fit a phone', async ({ browser }) => {
	const page = await guest(browser);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	for (const path of PUBLIC) {
		const res = await page.goto(path);
		expect(res?.status(), `${path} status`).toBeLessThan(400);
		await expectNoHorizontalScroll(page);
	}
	expect(errors, 'browser errors').toEqual([]);
});

test('signed-in pages load and fit a phone', async ({ browser }) => {
	const { page } = await signup(browser, 'smk');
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	for (const path of SIGNED_IN) {
		const res = await page.goto(path);
		expect(res?.status(), `${path} status`).toBeLessThan(400);
		await expectNoHorizontalScroll(page);
	}
	// The header fits on one line: the + Beat button never wraps.
	await page.goto('/battles');
	const beat = await page.locator('header .beat').boundingBox();
	expect(beat!.height).toBeLessThan(50);
	expect(errors, 'browser errors').toEqual([]);
});

test('admin-only pages are hidden from regular users', async ({ browser }) => {
	const { page } = await signup(browser, 'nob');
	for (const path of ['/admin/orders', '/admin/seed', '/admin/users']) {
		const res = await page.goto(path);
		expect(res?.status(), path).toBe(404);
	}
});

test('Stripe webhook rejects unsigned requests', async ({ baseURL }) => {
	const r = await fetch(`${baseURL}/api/stripe/webhook`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' } });
	expect([400, 503]).toContain(r.status);
});
