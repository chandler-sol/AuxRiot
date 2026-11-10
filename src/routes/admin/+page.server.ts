import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { VOTER_AGE_KEY, getVoterMinAgeHours, setSetting } from '#lib/server/settings.ts';
import { PROMO_MAX_HOURS, PROMO_SLOTS, bookPromotion } from '#lib/server/promos.ts';

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) error(404);
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals);
	const db = getEnv(platform).DB;

	const [reports, linked, discounted, dmca, banned] = await Promise.all([
		db.prepare(
			`SELECT r.*, u.username AS reporter FROM reports r JOIN users u ON u.id = r.reporter_id
			 WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 100`
		).all<Record<string, string | number>>(),
		// Accounts sharing an IP or device hash: likely alts.
		db.prepare(
			`SELECT s.kind, s.value_hash, GROUP_CONCAT(u.username, ', ') AS users, COUNT(*) AS n,
			        MAX(u.shadowbanned) AS any_banned
			 FROM user_signals s JOIN users u ON u.id = s.user_id
			 GROUP BY s.kind, s.value_hash HAVING COUNT(*) > 1
			 ORDER BY MAX(s.last_seen) DESC LIMIT 100`
		).all<{ kind: string; value_hash: string; users: string; n: number; any_banned: number }>(),
		db.prepare(
			`SELECT v.battle_id, v.weight, v.flags, v.updated_at, u.username AS voter, b.title
			 FROM votes v JOIN users u ON u.id = v.voter_id JOIN battles b ON b.id = v.battle_id
			 WHERE v.weight < 1 ORDER BY v.updated_at DESC LIMIT 100`
		).all<{ battle_id: string; weight: number; flags: string; updated_at: number; voter: string; title: string }>(),
		db.prepare(`SELECT * FROM dmca_requests WHERE status = 'open' ORDER BY created_at ASC LIMIT 100`).all<Record<string, string | number>>(),
		db.prepare(`SELECT username FROM users WHERE shadowbanned = 1 ORDER BY username LIMIT 200`).all<{ username: string }>()
	]);

	const now = Date.now();
	const promos = await db
		.prepare(
			`SELECT p.id, p.battle_id, p.starts_at, p.ends_at, p.source, p.slot, b.title, c.username AS creator, ch.username AS challenger, b.status
			 FROM promotions p JOIN battles b ON b.id = p.battle_id
			 JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id
			 WHERE p.cancelled = 0 AND p.ends_at > ? ORDER BY p.starts_at ASC LIMIT 50`
		)
		.bind(now)
		.all<{ id: string; battle_id: string; starts_at: number; ends_at: number; source: string; slot: number | null; title: string; creator: string; challenger: string | null; status: string }>();
	const outcomes = await db.prepare('SELECT COUNT(*) AS n FROM battle_outcomes').first<{ n: number }>();
	const DAY_MS = 86_400_000;
	const userStats = await db
		.prepare(
			`SELECT COUNT(*) AS total,
			        COALESCE(SUM(email_verified_at IS NOT NULL), 0) AS confirmed,
			        COALESCE(SUM(created_at >= ?), 0) AS today,
			        COALESCE(SUM(created_at >= ?), 0) AS week,
			        COALESCE(SUM(news_opt_in = 1), 0) AS news,
			        (SELECT COUNT(DISTINCT user_id) FROM entries) AS battlers,
			        (SELECT COUNT(DISTINCT voter_id) FROM votes) AS voters
			 FROM users`
		)
		.bind(now - DAY_MS, now - 7 * DAY_MS)
		.first<{ total: number; confirmed: number; today: number; week: number; news: number; battlers: number; voters: number }>();

	return {
		promos: promos.results,
		promoSlots: PROMO_SLOTS,
		promoMaxHours: PROMO_MAX_HOURS,
		outcomesRecorded: outcomes?.n ?? 0,
		userStats: userStats ?? { total: 0, confirmed: 0, today: 0, week: 0, news: 0, battlers: 0, voters: 0 },
		now,
		voterMinAgeHours: await getVoterMinAgeHours(db, getEnv(platform)),
		reports: reports.results,
		linked: linked.results,
		discounted: discounted.results,
		dmca: dmca.results,
		banned: banned.results.map((b) => b.username)
	};
};

export const actions: Actions = {
	promote: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const f = await request.formData();
		const raw = String(f.get('battle') ?? '').trim();
		const battleId = raw.match(/battles\/([A-Za-z0-9_-]+)/)?.[1] ?? raw;
		const hours = Number(f.get('hours'));
		const res = await bookPromotion(getEnv(platform).DB, { battleId, bookedBy: admin.id, hours, source: 'admin' });
		if (!res.ok) return fail(400, { error: res.error });
		return { booked: { slot: res.slot, startsAt: res.startsAt, endsAt: res.endsAt, startsNow: res.startsNow, hours } };
	},

	cancelPromo: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		await getEnv(platform).DB.prepare('UPDATE promotions SET cancelled = 1 WHERE id = ?').bind(id).run();
		return { ok: 'Promo cancelled.' };
	},

	voterAge: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const f = await request.formData();
		const hours = Number(f.get('hours'));
		if (!Number.isInteger(hours) || hours < 0 || hours > 24 * 90) {
			return fail(400, { error: 'Enter whole hours between 0 and 2160.' });
		}
		await setSetting(getEnv(platform).DB, VOTER_AGE_KEY, String(hours), admin.username);
		return { ok: hours === 0 ? 'Any account can now vote immediately.' : `New accounts can now vote after ${hours} hours.` };
	},

	shadowban: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const username = String(f.get('username') ?? '').trim();
		const on = f.get('on') === '1' ? 1 : 0;
		const res = await getEnv(platform).DB.prepare('UPDATE users SET shadowbanned = ? WHERE username = ?').bind(on, username).run();
		if (!res.meta.changes) return fail(404, { error: `No user "${username}".` });
		return { ok: `${username} ${on ? 'shadowbanned' : 'restored'}.` };
	},

	report: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const status = f.get('status') === 'actioned' ? 'actioned' : 'dismissed';
		await getEnv(platform).DB.prepare('UPDATE reports SET status = ? WHERE id = ?').bind(status, String(f.get('id'))).run();
		return { ok: 'Report updated.' };
	},

	dmca: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const env = getEnv(platform);
		const f = await request.formData();
		const id = String(f.get('id'));
		const decision = String(f.get('decision'));
		const req = await env.DB.prepare('SELECT battle_id, slot FROM dmca_requests WHERE id = ?').bind(id).first<{ battle_id: string; slot: number | null }>();
		if (!req) return fail(404, { error: 'Request not found.' });

		if (decision === 'reject') {
			await env.DB.prepare(`UPDATE dmca_requests SET status = 'rejected' WHERE id = ?`).bind(id).run();
			return { ok: 'Notice rejected.' };
		}

		// decision is 'remove0', 'remove1' or 'removeBoth'
		const slots = decision === 'remove0' ? [0] : decision === 'remove1' ? [1] : [0, 1];
		for (const slot of slots) {
			const entry = await env.DB.prepare('SELECT id, audio_key FROM entries WHERE battle_id = ? AND slot = ?')
				.bind(req.battle_id, slot)
				.first<{ id: string; audio_key: string }>();
			if (!entry) continue;
			await env.AUDIO.delete(entry.audio_key);
			await env.DB.prepare('UPDATE entries SET removed = 1 WHERE id = ?').bind(entry.id).run();
		}
		// A battle missing a beat can't be fairly judged; pull it if it hasn't finished.
		await env.DB.prepare(`UPDATE battles SET status = 'removed' WHERE id = ? AND status IN ('open', 'voting')`).bind(req.battle_id).run();
		await env.DB.prepare(`UPDATE dmca_requests SET status = 'removed' WHERE id = ?`).bind(id).run();
		return { ok: 'Audio removed.' };
	}
};
