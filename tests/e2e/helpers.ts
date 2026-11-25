import { expect, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Shared toolkit for the robot: accounts, database access, audio fixtures, Stripe events. */

export const BETA_PASSWORD = process.env.E2E_BETA_PASSWORD ?? 'local-test-pw';
export const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET ?? 'whsec_localtest123';
const ROOT = process.cwd(); // tests run from the repo root

/** A short unique suffix so every run makes fresh accounts. */
export const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4);

/** Run SQL against the local D1 database the dev server uses. */
export function sql<T = Record<string, unknown>>(query: string): T[] {
	const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'auxriot-beta', '--local', '--env', 'beta', '--json', '--command', query], {
		cwd: ROOT,
		stdio: ['ignore', 'pipe', 'ignore']
	}).toString();
	return JSON.parse(out)[0].results as T[];
}
export const one = <T = Record<string, unknown>>(query: string) => sql<T>(query)[0];

/** Get past the beta password page. */
export async function gate(page: Page) {
	await page.goto('/');
	const pw = page.locator('input[name=password]');
	if (await pw.count()) {
		await pw.fill(BETA_PASSWORD);
		await page.locator('button').click();
		await page.waitForLoadState('networkidle');
	}
}

export type Account = { page: Page; name: string; id: string };

/**
 * Sign up through the real form, then age/verify the account so it can vote,
 * and optionally make it an admin. Clears the signup rate limit first (the
 * robot makes far more accounts per hour than a real person).
 */
export async function signup(browser: Browser, prefix = 'u', opts: { admin?: boolean; fresh?: boolean } = {}): Promise<Account> {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	page.on('pageerror', (e) => console.log(`[pageerror ${prefix}]`, e.message));
	await gate(page);
	sql('DELETE FROM auth_attempts');
	const name = (prefix + uid()).slice(0, 20);
	await page.goto('/signup');
	await page.fill('#username', name);
	await page.fill('#email', `${name}@robot.test`);
	await page.fill('#password', 'password123');
	await page.check('input[name=agree]');
	await page.click('button.primary');
	await page.waitForLoadState('networkidle');
	const row = one<{ id: string }>(`SELECT id FROM users WHERE username = '${name}'`);
	expect(row, `account ${name} was created`).toBeTruthy();
	sql(`UPDATE users SET email_verified_at = 1${opts.fresh ? '' : ', created_at = 1'}${opts.admin ? ', is_admin = 1' : ''} WHERE id = '${row.id}'`);
	return { page, name, id: row.id };
}

/** Log out the beta visitor's state and come back as a logged-out guest. */
export async function guest(browser: Browser) {
	const page = await (await browser.newContext()).newPage();
	await gate(page);
	return page;
}

/** Post a SvelteKit form action from inside the page (with its cookies), like an enhanced form would. */
export async function action(page: Page, path: string, name: string, fields: Record<string, string | number>) {
	return page.evaluate(
		async ({ path, name, fields }) => {
			const fd = new FormData();
			for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
			const r = await fetch(`${path}?/${name}`, { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true' } });
			return (await r.json()) as { type: string; data?: string; status?: number };
		},
		{ path, name, fields }
	);
}

/** Same score in every category: s0 for corner A, s1 for corner B. */
export const scores = (a: number, b: number) =>
	Object.fromEntries((['drums', 'melody', 'mix', 'overall'] as const).flatMap((c) => [[`s0_${c}`, a], [`s1_${c}`, b]]));

/** Pretend this user listened to every beat (or one round) in a battle. */
export function hearAll(userId: string, battleId: string, round?: number) {
	sql(
		`INSERT OR REPLACE INTO listens (user_id, entry_id, first_at, last_at, listened_ms)
		 SELECT '${userId}', id, 1, 2, duration_ms FROM entries WHERE battle_id = '${battleId}'${round ? ` AND round = ${round}` : ''}`
	);
}

/** Two short WAV beats (different tones) for the real upload flow. Made once per machine. */
export function wavs(): [string, string] {
	const dir = join(tmpdir(), 'auxriot-robot');
	const files: [string, string] = [join(dir, 'beat-a.wav'), join(dir, 'beat-b.wav')];
	if (files.every(existsSync)) return files;
	mkdirSync(dir, { recursive: true });
	const make = (path: string, freq: number) => {
		const rate = 22050, secs = 8, n = rate * secs;
		const buf = Buffer.alloc(44 + n * 2);
		buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
		buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
		buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
		for (let i = 0; i < n; i++) {
			const t = i / rate;
			const beat = Math.exp(-((t * 2) % 1) * 8); // a kick-ish pulse twice a second
			const v = 0.35 * Math.sin(2 * Math.PI * freq * t) * (0.4 + 0.6 * beat) + 0.25 * Math.sin(2 * Math.PI * 55 * t) * beat;
			buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
		}
		writeFileSync(path, buf);
	};
	make(files[0], 330);
	make(files[1], 440);
	return files;
}

/** Deliver a signed Stripe event to the local webhook (exactly how Stripe signs it). */
export async function stripeEvent(baseURL: string, type: string, object: Record<string, unknown>) {
	const payload = JSON.stringify({ id: `evt_robot_${uid()}`, type, data: { object } });
	const t = Math.floor(Date.now() / 1000);
	const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
	const r = await fetch(`${baseURL}/api/stripe/webhook`, { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${sig}`, 'content-type': 'application/json' } });
	return { status: r.status, text: await r.text() };
}

/** Run a test-lab button and return the first battle id it reports. */
export async function labBattle(page: Page, button: string) {
	await page.goto('/admin/seed');
	await page.getByRole('button', { name: button }).first().click();
	await page.waitForFunction(() => !document.querySelector('.log .spin'), null, { timeout: 180_000 });
	const text = (await page.locator('.log p.ok').first().textContent()) ?? '';
	const id = text.match(/battles\/(\S+)/)?.[1];
	expect(id, `test lab "${button}" made a battle (log: ${text})`).toBeTruthy();
	return id!;
}

/** No sideways scrolling on a phone: the most common layout bug we've had. */
export async function expectNoHorizontalScroll(page: Page) {
	const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
	expect(sw, `page is ${sw}px wide on a ${cw}px screen`).toBeLessThanOrEqual(cw + 1);
}

/** Count rows, waiting a few seconds for work the server finishes after responding (emails, notifications). */
export async function eventually(query: string, expected = 1) {
	await expect.poll(() => sql(query).length, { timeout: 10_000, message: query }).toBe(expected);
}
