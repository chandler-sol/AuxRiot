import { test, expect, type Page } from '@playwright/test';
import { action, hearAll, one, scores, signup, sql, wavs, guest, eventually } from './helpers';

// Best of 3 with per-round judging, a tie into overtime, blind overtime drops,
// and the forced-overtime forfeit.

async function postBo3(page: Page, title: string) {
	const [a, b] = wavs();
	await page.goto('/battles/new');
	await page.fill('#title', title);
	await page.click('label.hour:has-text("Best of 3")');
	const inputs = page.locator('ol.set input[type=file]');
	for (const [i, f] of [a, b, a].entries()) await inputs.nth(i).setInputFiles(f);
	await expect(page.locator('ol.set .preview')).toHaveCount(3, { timeout: 90_000 });
	await page.check('input[name=ack_rights]');
	await page.click('button.primary');
	await page.waitForURL(/\/battles\/(?!new)[^/]+$/);
	return page.url().split('/').pop()!;
}

async function answerBo3(page: Page, id: string) {
	const [a, b] = wavs();
	await page.goto(`/battles/${id}`);
	const inputs = page.locator('#answer ol.set input[type=file]');
	for (const [i, f] of [b, a, b].entries()) await inputs.nth(i).setInputFiles(f);
	await expect(page.locator('#answer .preview')).toHaveCount(3, { timeout: 90_000 });
	await page.check('#answer input[name=ack_rights]');
	await page.click('#answer button.primary');
	await expect.poll(() => one<{ status: string }>(`SELECT status FROM battles WHERE id = '${id}'`).status).toBe('voting');
}

async function dropOvertime(page: Page, id: string, file: string) {
	await page.goto(`/battles/${id}`);
	await page.locator('.otcard input[type=file]').setInputFiles(file);
	await expect(page.locator('.otcard .preview')).toBeVisible({ timeout: 60_000 });
	await page.check('.otcard input[name=ack_rights]');
	await page.click('.otcard button.primary');
}

test('best of 3: rounds, tie, overtime, results', async ({ browser }) => {
	const [beatA, beatB] = wavs();
	const a = await signup(browser, 'boA');
	const id = await postBo3(a.page, 'Robot Bo3');
	expect(sql(`SELECT 1 FROM entries WHERE battle_id = '${id}'`).length).toBe(3);

	// Challengers only get round 1, as a short taste.
	const g = await guest(browser);
	await g.goto(`/battles/${id}`);
	await expect(g.locator('.mb .round')).toHaveCount(1);
	await expect(g.locator('.hidden-rounds')).toBeVisible();

	const c = await signup(browser, 'boC');
	await answerBo3(c.page, id);

	// A ballot only counts once every round is scored.
	const j1 = await signup(browser, 'bj'), j2 = await signup(browser, 'bj');
	hearAll(j1.id, id);
	hearAll(j2.id, id);
	await j1.page.goto(`/battles/${id}`);
	await expect(j1.page.locator('.mb form.rform')).toHaveCount(3);
	for (const r of [1, 2]) await action(j1.page, `/battles/${id}`, 'voteRound', { round: r, ...scores(5, 3) });
	expect(sql(`SELECT 1 FROM votes WHERE battle_id = '${id}'`).length).toBe(0);
	await action(j1.page, `/battles/${id}`, 'voteRound', { round: 3, ...scores(5, 3) });
	expect(sql(`SELECT 1 FROM votes WHERE battle_id = '${id}'`).length).toBe(1);
	for (const r of [1, 2, 3]) await action(j2.page, `/battles/${id}`, 'voteRound', { round: r, ...scores(3, 5) }); // mirror: exact tie

	// Exact tie: overtime is offered, records untouched.
	sql(`UPDATE battles SET voting_ends_at = 1 WHERE id = '${id}'`);
	await a.page.goto(`/battles/${id}`);
	expect(one(`SELECT status, ot_status, ot_mode FROM battles WHERE id = '${id}'`)).toEqual({ status: 'overtime', ot_status: 'offered', ot_mode: 'tie' });
	expect(one<{ ties: number }>(`SELECT ties FROM users WHERE id = '${a.id}'`).ties).toBe(0);
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${c.id}' AND kind = 'ot_offered'`, 1);

	// Blind drops: the challenger can't hear A's overtime beat until theirs is in.
	await dropOvertime(a.page, id, beatB);
	await c.page.goto(`/battles/${id}`);
	await expect(c.page.locator('.otcard')).toContainText(/1 of 2/i);
	await expect(c.page.locator('.otcard .pair')).toHaveCount(0);
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${c.id}' AND kind = 'ot_opponent_dropped'`, 1);
	await dropOvertime(c.page, id, beatA);
	await expect.poll(() => one<{ ot_status: string }>(`SELECT ot_status FROM battles WHERE id = '${id}'`).ot_status).toBe('voting');
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${j1.id}' AND kind = 'ot_vote_open'`, 1);

	// The overtime round decides it.
	hearAll(j1.id, id, 4);
	expect((await action(j1.page, `/battles/${id}`, 'voteOt', scores(5, 2))).type).toBe('success');
	sql(`UPDATE battles SET ot_ends_at = 1 WHERE id = '${id}'`);
	await j1.page.goto(`/battles/${id}`);
	expect(one(`SELECT status, ot_status, winner_id = creator_id AS creator_won FROM battles WHERE id = '${id}'`)).toEqual({ status: 'closed', ot_status: 'done', creator_won: 1 });
	await expect(j1.page.locator('.rtable')).toContainText(/overtime/i);
	const paid = sql<{ ref: string }>(`SELECT ref FROM credit_ledger WHERE user_id = '${j1.id}' AND reason = 'judge_reward'`).map((r) => r.ref);
	expect(paid).toEqual(expect.arrayContaining([id, `${id}:ot`]));
});

test('forced overtime: one drop wins by forfeit', async ({ browser }) => {
	const [, beatB] = wavs();
	const a = await signup(browser, 'ffA');
	const c = await signup(browser, 'ffC');
	const id = await postBo3(a.page, 'Robot forfeit');
	await answerBo3(c.page, id);
	// Five judges favour A but ask for overtime.
	for (let i = 0; i < 5; i++) {
		const j = await signup(browser, 'fj');
		hearAll(j.id, id);
		await j.page.goto(`/battles/${id}`);
		for (const r of [1, 2, 3]) await action(j.page, `/battles/${id}`, 'voteRound', { round: r, wants_ot: 'on', ...scores(5, 2) });
		await j.page.context().close();
	}
	sql(`UPDATE battles SET voting_ends_at = 1 WHERE id = '${id}'`);
	await a.page.goto(`/battles/${id}`);
	expect(one(`SELECT status, ot_mode FROM battles WHERE id = '${id}'`)).toEqual({ status: 'overtime', ot_mode: 'forced' });
	// Only the challenger drops, then the window closes.
	await dropOvertime(c.page, id, beatB);
	sql(`UPDATE battles SET ot_deadline = 1 WHERE id = '${id}'`);
	await a.page.goto(`/battles/${id}`);
	expect(one(`SELECT status, ot_status, winner_id = challenger_id AS challenger_won FROM battles WHERE id = '${id}'`)).toEqual({ status: 'closed', ot_status: 'declined', challenger_won: 1 });
	await expect(a.page.locator('.rtable .otrow')).toContainText(/forfeit/i);
});
