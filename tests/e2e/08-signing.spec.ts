import { test, expect } from '@playwright/test';
import { labBattle, one, signup, sql } from './helpers';

// v5 signing: the seller enables selling (5 commitments), then signs each listing's offer
// (rights schedule answered line by line, 6 commitments, typed legal name). Signatures are
// kept as acceptance records; a material change needs a fresh signature. Existing users see
// the updated Terms notice and accept once.

test('seller signs the account checklist and the listing offer (v5)', async ({ browser }) => {
	const admin = await signup(browser, 'sgA', { admin: true });
	const battleId = await labBattle(admin.page, 'Store shelf');
	const l = one<{ id: string; seller_id: string; round: number }>(
		`SELECT l.id, l.seller_id, e.round FROM listings l JOIN entries e ON e.id = l.entry_id WHERE l.battle_id = '${battleId}' AND l.status = 'listed' LIMIT 1`
	);
	// Start this producer from scratch under v5: not agreed, listing unsigned and off the store.
	sql(`UPDATE users SET seller_agreement_version = NULL, legal_name = 'Tess Producer' WHERE id = '${l.seller_id}'`);
	sql(`UPDATE listings SET status = 'unlisted', producer_signed_at = NULL, rights_schedule = NULL, listing_version = 0 WHERE id = '${l.id}'`);

	// Browse as that test producer (test lab "Log in as").
	await admin.page.goto('/admin/seed');
	await admin.page.request.post('/admin/seed?/loginAs', { form: { user: l.seller_id }, headers: { origin: new URL(admin.page.url()).origin }, maxRedirects: 0 });
	const page = admin.page;
	await page.goto(`/battles/${battleId}/sell?round=${l.round}`);

	// Step one: five commitments, straight from the checklist.
	const boxes = page.locator('.agree input[name=item]');
	await expect(boxes).toHaveCount(5);
	for (const b of await boxes.all()) await b.check();
	await page.getByRole('button', { name: 'Agree and enable selling' }).click();
	await expect(page.locator('.success')).toContainText(/selling enabled/i);
	expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM acceptances WHERE user_id = '${l.seller_id}' AND kind = 'seller_account' AND doc_version = '2026-11-27-v5'`).n).toBe(1);

	// Step two: the button stays off until every rights line is answered and every commitment ticked.
	const sign = page.getByRole('button', { name: 'Sign and list this beat' });
	await expect(sign).toBeDisabled();
	await page.locator('#writers').fill('Sole writer and producer, 100%. No publisher.');
	for (const k of ['samples', 'ai', 'voice', 'restrictions']) await page.locator(`input[name=${k}_has][value=none]`).check();
	await expect(page.locator('.summary')).toContainText(`ID ${l.id}`);
	const commits = page.locator('input[name=commit]');
	await expect(commits).toHaveCount(6);
	for (const c of await commits.all()) await c.check();
	await page.locator('#signature').fill('Tess Producer');
	await sign.click();
	await expect(page.locator('.success')).toContainText(/on sale/i);
	const after = one<{ status: string; listing_version: number; license_version: string; producer_acceptance_id: string; rights_schedule: string }>(
		`SELECT status, listing_version, license_version, producer_acceptance_id, rights_schedule FROM listings WHERE id = '${l.id}'`
	);
	expect(after).toMatchObject({ status: 'listed', listing_version: 1, license_version: '2026-11-27-v5' });
	expect(JSON.parse(after.rights_schedule)).toMatchObject({ samples: 'none', ai: 'none' });
	const acc = one<{ kind: string; signer_name: string; capacity: string; snapshot: string }>(`SELECT kind, signer_name, capacity, snapshot FROM acceptances WHERE id = '${after.producer_acceptance_id}'`);
	expect(acc).toMatchObject({ kind: 'listing', signer_name: 'Tess Producer', capacity: 'self' });
	expect(JSON.parse(acc.snapshot)).toMatchObject({ beat_id: l.id, listing_version: 1 });

	// A material change while listed needs a new signature.
	await page.locator('#credit').fill('A Different Credit');
	await page.getByRole('button', { name: /save changes/i }).click();
	await expect(page.locator('.error')).toContainText(/sign again/i);
	expect(one(`SELECT listing_version FROM listings WHERE id = '${l.id}'`)).toEqual({ listing_version: 1 });
});

test('existing users review and accept the updated terms once', async ({ browser }) => {
	const u = await signup(browser, 'tmU');
	expect(one(`SELECT terms_version FROM users WHERE id = '${u.id}'`)).toEqual({ terms_version: '2026-11-27-v5' }); // new signups accept v5
	sql(`UPDATE users SET terms_version = NULL WHERE id = '${u.id}'`);
	await u.page.goto('/store');
	await u.page.locator('.termsbar').click();
	await expect(u.page).toHaveURL(/\/terms\/updated/);
	const accept = u.page.getByRole('button', { name: 'Accept' });
	await expect(accept).toBeDisabled();
	await u.page.locator('input[name=agree]').check();
	await accept.click();
	await expect(u.page).toHaveURL(/\/store$/);
	await expect(u.page.locator('.termsbar')).toHaveCount(0);
	expect(one(`SELECT terms_version FROM users WHERE id = '${u.id}'`)).toEqual({ terms_version: '2026-11-27-v5' });
	expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM acceptances WHERE user_id = '${u.id}' AND kind = 'site_terms'`).n).toBe(2);
});
