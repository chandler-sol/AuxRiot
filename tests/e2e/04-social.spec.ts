import { test, expect } from '@playwright/test';
import { guest, labBattle, one, signup, sql, eventually } from './helpers';

// Comments with @tags, the notification bell, verified creators and crews.

test('tags: autocomplete, links, limits and notifications', async ({ browser }) => {
	const admin = await signup(browser, 'tgA', { admin: true });
	const id = await labBattle(admin.page, 'Judge a Bo3 yourself');
	const bt = one<{ cid: string; cname: string; hid: string }>(
		`SELECT c.id AS cid, c.username AS cname, ch.id AS hid FROM battles b JOIN users c ON c.id = b.creator_id JOIN users ch ON ch.id = b.challenger_id WHERE b.id = '${id}'`
	);
	const page = admin.page;
	await page.goto(`/battles/${id}`);
	const box = page.locator('.wrap textarea');

	// @ suggests the battlers first; typing narrows it; Enter inserts.
	await box.click();
	await box.pressSequentially('Yo @');
	await expect(page.locator('.sugg li').first()).toContainText(/battler/i);
	await box.pressSequentially(bt.cname.slice(0, 4));
	await expect(page.locator('.sugg li').first()).toContainText(bt.cname, { ignoreCase: true });
	await box.press('Enter');
	await expect(box).toHaveValue(new RegExp(`@${bt.cname} $`, 'i'));
	await box.pressSequentially('round 2 is crazy @nobodyhere123');
	await page.getByRole('button', { name: 'Post comment' }).click();

	// Real names link; typos stay text; the comment has an anchor.
	const c = page.locator('.comments li').last();
	await expect(c.locator('a.mention')).toHaveText(`@${bt.cname}`);
	await expect(c.locator('.body')).toContainText('@nobodyhere123');
	expect(await c.getAttribute('id')).toMatch(/^c-/);

	// The tagged battler gets a mention (not a duplicate comment note); the other battler gets a comment note.
	const kinds = (uidv: string) => sql<{ kind: string; count: number }>(`SELECT kind, count FROM notifications WHERE user_id = '${uidv}' AND url LIKE '/battles/${id}%'`);
	expect(kinds(bt.cid).map((n) => n.kind)).toEqual(['mention']);
	expect(kinds(bt.hid)).toEqual([{ kind: 'battle_comment', count: 1 }]);

	// A second comment merges into "2 new comments".
	sql(`UPDATE comments SET created_at = created_at - 60000 WHERE user_id = '${admin.id}'`); // skip the 10s cooldown
	await box.fill('second take on round 3');
	await page.getByRole('button', { name: 'Post comment' }).click();
	await expect(page.locator('.comments')).toContainText('second take on round 3');
	expect(kinds(bt.hid)).toEqual([{ kind: 'battle_comment', count: 2 }]);

	// Six tags is too many: warned in the box and refused by the server.
	sql(`UPDATE comments SET created_at = created_at - 60000 WHERE user_id = '${admin.id}'`);
	await box.fill('@aaa1 @aaa2 @aaa3 @aaa4 @aaa5 @aaa6');
	await expect(page.locator('.wrap .error')).toBeVisible();
	await page.getByRole('button', { name: 'Post comment' }).click();
	await expect(page.locator('form .error').first()).toContainText(/up to 5/i);
});

test('bell: unread count, page, and clearing', async ({ browser }) => {
	const u = await signup(browser, 'bel');
	sql(`INSERT INTO notifications (id, user_id, kind, text, url, created_at) VALUES ('n1${u.id}', '${u.id}', 'credits_granted', '+500 credits from AuxRiot', '/credits', ${Date.now()}), ('n2${u.id}', '${u.id}', 'verified', 'You are verified', '/', ${Date.now()})`);
	await u.page.goto('/battles');
	await expect(u.page.locator('.bell .badge')).toHaveText('2');
	await u.page.locator('.bell').click();
	await expect(u.page.locator('.note.unread')).toHaveCount(2);
	await expect(u.page.locator('.note').first()).toContainText(/credits|verified/i);
	await expect(u.page.locator('.bell .badge')).toHaveCount(0);
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${u.id}' AND read_at IS NULL`, 0);
});

test('verified creators get a badge, a crew link, and crew members', async ({ browser }) => {
	const creator = await signup(browser, 'str');
	sql(`UPDATE users SET verified_label = 'Streamer', verified_at = 1 WHERE id = '${creator.id}'`);

	// A fan signs up through the crew link.
	const fan = await guest(browser);
	await fan.goto(`/with/${creator.name}`);
	await expect(fan.locator('.crewban')).toContainText(creator.name, { ignoreCase: true });
	sql('DELETE FROM auth_attempts');
	const fanName = `fan${Date.now().toString(36).slice(-6)}`;
	await fan.fill('#username', fanName);
	await fan.fill('#email', `${fanName}@robot.test`);
	await fan.fill('#password', 'password123');
	await fan.check('input[name=agree]');
	await fan.click('button.primary');
	await fan.waitForLoadState('networkidle');
	expect(one<{ crew: string }>(`SELECT (SELECT username FROM users c WHERE c.id = f.crew_id) AS crew FROM users f WHERE username = '${fanName}'`).crew).toBe(creator.name);
	await eventually(`SELECT 1 FROM notifications WHERE user_id = '${creator.id}' AND kind = 'crew_join'`, 1);

	// An existing user joins from the profile, then leaves.
	const other = await signup(browser, 'oth');
	await other.page.goto(`/u/${creator.name}`);
	await expect(other.page.locator('.badges')).toContainText(/streamer/i);
	await other.page.getByRole('button', { name: /Join .* crew/ }).click();
	await expect(other.page.locator('.crewbox .success')).toBeVisible();
	await other.page.getByRole('button', { name: 'Leave crew' }).click();
	await expect.poll(() => one<{ crew_id: string | null }>(`SELECT crew_id FROM users WHERE id = '${other.id}'`).crew_id).toBeNull();

	// The creator sees their crew size and link.
	await creator.page.goto(`/u/${creator.name}`);
	await expect(creator.page.locator('.crewbox')).toContainText(`/with/${creator.name}`);
});
