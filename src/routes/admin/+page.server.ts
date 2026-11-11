import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { VOTER_AGE_KEY, getVoterMinAgeHours, setSetting } from '#lib/server/settings.ts';
import { PROMO_MAX_HOURS, PROMO_SLOTS, bookPromotion } from '#lib/server/promos.ts';
import { MIN_VOTES_KEY, addCredits, backfillCredits, getMinVotes } from '#lib/server/credits.ts';
import { logAction, requireAdmin, requireMod, setShadowban } from '#lib/server/mod.ts';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const me = requireMod(locals);
	const db = getEnv(platform).DB;

	const counts = await db
		.prepare(
			`SELECT (SELECT COUNT(*) FROM reports WHERE status = 'open') AS reports,
			        (SELECT COUNT(*) FROM comments WHERE held = 1 AND hidden = 0) AS held,
			        (SELECT COUNT(*) FROM battles WHERE status = 'voting') AS live,
			        (SELECT COUNT(*) FROM users WHERE suspended_at IS NOT NULL) AS suspended,
			        (SELECT COUNT(*) FROM mod_log WHERE created_at > ?) AS actionsToday`
		)
		.bind(Date.now() - 86_400_000)
		.first<{ reports: number; held: number; live: number; suspended: number; actionsToday: number }>();

	const [linked, discounted, banned] = await Promise.all([
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
		db.prepare(`SELECT username FROM users WHERE shadowbanned = 1 ORDER BY username LIMIT 200`).all<{ username: string }>()
	]);
	const mod = {
		isAdmin: me.isAdmin,
		counts: counts ?? { reports: 0, held: 0, live: 0, suspended: 0, actionsToday: 0 },
		linked: linked.results,
		discounted: discounted.results,
		banned: banned.results.map((b) => b.username)
	};
	if (!me.isAdmin) return { ...mod, admin: null };

	const dmca = await db.prepare(`SELECT * FROM dmca_requests WHERE status = 'open' ORDER BY created_at ASC LIMIT 100`).all<Record<string, string | number>>();

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

	const creditStats = await db
		.prepare(
			`SELECT (SELECT COALESCE(SUM(credits), 0) FROM users) AS outstanding,
			        (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger WHERE reason LIKE 'battle_%') AS earned,
			        (SELECT COALESCE(-SUM(amount), 0) FROM credit_ledger WHERE reason = 'promo_spend') - (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger WHERE reason = 'promo_refund') AS spent,
			        (SELECT COUNT(DISTINCT o.battle_id) FROM battle_outcomes o WHERE NOT EXISTS (SELECT 1 FROM credit_ledger l WHERE l.ref = o.battle_id AND l.reason LIKE 'battle_%')) AS unpaid`
		)
		.first<{ outstanding: number; earned: number; spent: number; unpaid: number }>();

	return {
		...mod,
		admin: {
		creditStats: creditStats ?? { outstanding: 0, earned: 0, spent: 0, unpaid: 0 },
		creditsMinVotes: await getMinVotes(db),
		promos: promos.results,
		promoSlots: PROMO_SLOTS,
		promoMaxHours: PROMO_MAX_HOURS,
		outcomesRecorded: outcomes?.n ?? 0,
		userStats: userStats ?? { total: 0, confirmed: 0, today: 0, week: 0, news: 0, battlers: 0, voters: 0 },
		now,
		voterMinAgeHours: await getVoterMinAgeHours(db, getEnv(platform)),
		dmca: dmca.results
		}
	};
};

export const actions: Actions = {
	creditsMinVotes: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const n = Number((await request.formData()).get('n'));
		if (!Number.isInteger(n) || n < 0 || n > 100) return fail(400, { error: 'Enter a whole number from 0 to 100.' });
		await setSetting(getEnv(platform).DB, MIN_VOTES_KEY, String(n), admin.username);
		await logAction(getEnv(platform).DB, admin, 'settings.credits_min_votes', 'settings', MIN_VOTES_KEY, String(n));
		return { ok: `Battles now pay out with at least ${n} counted vote${n === 1 ? '' : 's'}.` };
	},

	creditsBackfill: async ({ locals, platform }) => {
		const admin = requireAdmin(locals);
		const r = await backfillCredits(getEnv(platform).DB);
		await logAction(getEnv(platform).DB, admin, 'credits.backfill', 'credits', '', `${r.paidBattles} battles, ${r.credits} credits`);
		return { ok: `Checked ${r.checked} past battle${r.checked === 1 ? '' : 's'}: ${r.paidBattles} paid out, ${r.credits.toLocaleString()} credits awarded.` };
	},

	creditsAdjust: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const f = await request.formData();
		const username = String(f.get('username') ?? '').trim();
		const amount = Number(f.get('amount'));
		const note = String(f.get('note') ?? '').trim();
		if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) return fail(400, { error: 'Amount must be a whole number (negative to claw back).' });
		const db = getEnv(platform).DB;
		const u = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: string }>();
		if (!u) return fail(404, { error: `No user "${username}".` });
		await addCredits(db, u.id, amount, amount > 0 ? 'admin_grant' : 'admin_clawback', newId(), note || `by ${admin.username}`);
		await logAction(db, admin, amount > 0 ? 'credits.grant' : 'credits.clawback', 'user', u.id, `${username} ${amount > 0 ? '+' : ''}${amount}${note ? ' — ' + note : ''}`);
		return { ok: `${amount > 0 ? 'Gave' : 'Took'} ${Math.abs(amount).toLocaleString()} credits ${amount > 0 ? 'to' : 'from'} ${username}.` };
	},

	promote: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const f = await request.formData();
		const raw = String(f.get('battle') ?? '').trim();
		const battleId = raw.match(/battles\/([A-Za-z0-9_-]+)/)?.[1] ?? raw;
		const hours = Number(f.get('hours'));
		const res = await bookPromotion(getEnv(platform).DB, { battleId, bookedBy: admin.id, hours, source: 'admin' });
		if (!res.ok) return fail(400, { error: res.error });
		await logAction(getEnv(platform).DB, admin, 'promo.book', 'battle', battleId, `${hours}h, slot ${res.slot}`);
		return { booked: { slot: res.slot, startsAt: res.startsAt, endsAt: res.endsAt, startsNow: res.startsNow, hours } };
	},

	cancelPromo: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		await getEnv(platform).DB.prepare('UPDATE promotions SET cancelled = 1 WHERE id = ?').bind(id).run();
		await logAction(getEnv(platform).DB, admin, 'promo.cancel', 'promo', id);
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
		await logAction(getEnv(platform).DB, admin, 'settings.voter_age', 'settings', VOTER_AGE_KEY, `${hours}h`);
		return { ok: hours === 0 ? 'Any account can now vote immediately.' : `New accounts can now vote after ${hours} hours.` };
	},

	shadowban: async ({ request, locals, platform }) => {
		const me = requireMod(locals);
		const f = await request.formData();
		const username = String(f.get('username') ?? '').trim();
		const on = f.get('on') === '1';
		const db = getEnv(platform).DB;
		const u = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: string }>();
		if (!u) return fail(404, { error: `No user "${username}".` });
		const err = await setShadowban(db, me, u.id, on);
		if (err) return fail(403, { error: err });
		return { ok: `${username} ${on ? 'shadowbanned' : 'restored'}.` };
	},

	dmca: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const env = getEnv(platform);
		const f = await request.formData();
		const id = String(f.get('id'));
		const decision = String(f.get('decision'));
		const req = await env.DB.prepare('SELECT battle_id, slot FROM dmca_requests WHERE id = ?').bind(id).first<{ battle_id: string; slot: number | null }>();
		if (!req) return fail(404, { error: 'Request not found.' });

		if (decision === 'reject') {
			await env.DB.prepare(`UPDATE dmca_requests SET status = 'rejected' WHERE id = ?`).bind(id).run();
			await logAction(env.DB, admin, 'dmca.reject', 'battle', req.battle_id, id);
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
		await logAction(env.DB, admin, 'dmca.remove', 'battle', req.battle_id, decision);
		return { ok: 'Audio removed.' };
	}
};
