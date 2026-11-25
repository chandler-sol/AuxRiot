import { test, expect } from '@playwright/test';
import { action, hearAll, one, scores, signup, sql, wavs, guest, eventually } from './helpers';

// The core loop: post a beat, someone answers, the crowd judges, results land.

test('1-beat battle from upload to results', async ({ browser }) => {
	const [beatA, beatB] = wavs();
	const a = await signup(browser, 'crA');
	const b = await signup(browser, 'crB');

	// Corner A posts a beat through the real uploader (decode, encode, waveform).
	await a.page.goto('/battles/new');
	await a.page.fill('#title', 'Robot battle');
	await a.page.locator('ol.set input[type=file]').first().setInputFiles(beatA);
	await expect(a.page.locator('ol.set .preview')).toHaveCount(1, { timeout: 60_000 });
	await a.page.check('input[name=ack_rights]');
	await a.page.click('button.primary');
	await a.page.waitForURL(/\/battles\/(?!new)[^/]+$/);
	const id = a.page.url().split('/').pop()!;
	expect(one<{ status: string }>(`SELECT status FROM battles WHERE id = '${id}'`).status).toBe('open');

	// A guest hears only a short preview of an open challenge.
	const g = await guest(browser);
	await g.goto(`/battles/${id}`);
	await expect(g.locator('main')).toContainText(/preview|taste/i);

	// Corner B answers: voting starts and A is notified.
	await b.page.goto(`/battles/${id}`);
	await b.page.locator('#answer input[type=file]').setInputFiles(beatB);
	await expect(b.page.locator('#answer .preview')).toHaveCount(1, { timeout: 60_000 });
	await b.page.check('#answer input[name=ack_rights]');
	await b.page.getByRole('button', { name: 'Answer this battle' }).click();
	await expect.poll(() => one<{ status: string }>(`SELECT status FROM battles WHERE id = '${id}'`).status).toBe('voting');
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${a.id}' AND kind = 'battle_answered'`, 1);

	// Three judges who listened score it for A.
	const judges = [await signup(browser, 'jdg'), await signup(browser, 'jdg'), await signup(browser, 'jdg')];
	for (const j of judges) {
		hearAll(j.id, id);
		await j.page.goto(`/battles/${id}`);
		const r = await action(j.page, `/battles/${id}`, 'vote', scores(5, 3));
		expect(r.type, `${j.name} vote`).toBe('success');
	}
	// Battlers can't judge themselves.
	hearAll(a.id, id);
	expect((await action(a.page, `/battles/${id}`, 'vote', scores(5, 1))).type).toBe('failure');

	// A comment shows up for everyone.
	await judges[0].page.goto(`/battles/${id}`);
	await judges[0].page.locator('.wrap textarea').fill('Corner A had the bounce');
	await judges[0].page.getByRole('button', { name: 'Post comment' }).click();
	await expect(judges[0].page.locator('.comments')).toContainText('Corner A had the bounce');

	// Time's up: results, records, credits and notifications.
	sql(`UPDATE battles SET voting_ends_at = 1 WHERE id = '${id}'`);
	await a.page.goto(`/battles/${id}`);
	const done = one<{ status: string; winner: number }>(`SELECT status, winner_id = creator_id AS winner FROM battles WHERE id = '${id}'`);
	expect(done).toEqual({ status: 'closed', winner: 1 });
	await expect(a.page.locator('.wname')).toContainText(a.name, { ignoreCase: true });
	expect(one<{ wins: number }>(`SELECT wins FROM users WHERE id = '${a.id}'`).wins).toBe(1);
	expect(sql(`SELECT 1 FROM credit_ledger WHERE user_id = '${a.id}' AND reason = 'battle_win' AND ref = '${id}'`).length).toBe(1);
	for (const j of judges) {
		expect(sql(`SELECT 1 FROM credit_ledger WHERE user_id = '${j.id}' AND reason = 'judge_reward' AND ref = '${id}'`).length, `${j.name} paid`).toBe(1);
		await eventually(`SELECT 1 FROM notifications WHERE user_id = '${j.id}' AND kind = 'judge_credits'`, 1);
	}
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${b.id}' AND kind = 'battle_result'`, 1);
});
