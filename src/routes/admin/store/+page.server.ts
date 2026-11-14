import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { logAction, requireAdmin, requireMod } from '#lib/server/mod.ts';
import { setSetting } from '#lib/server/settings.ts';
import { FEE_KEY, MIN_PRICE_KEY, storeSettings } from '#lib/server/store.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = requireMod(locals);
	const db = getEnv().DB;
	const status = ['listed', 'draft', 'unlisted', 'sold', 'removed', 'services'].includes(url.searchParams.get('status') ?? '') ? url.searchParams.get('status')! : 'listed';
	const [settings, counts, median, rows] = await Promise.all([
		storeSettings(db),
		db.prepare(`SELECT status, COUNT(*) AS n FROM listings GROUP BY status`).all<{ status: string; n: number }>(),
		// Median listed price, to flag outliers ("keep an eye on data").
		db.prepare(
			`SELECT price_cents FROM listings WHERE status = 'listed' AND price_cents IS NOT NULL ORDER BY price_cents
			 LIMIT 1 OFFSET (SELECT COUNT(*) FROM listings WHERE status = 'listed' AND price_cents IS NOT NULL) / 2`
		).first<{ price_cents: number }>(),
		db.prepare(
			`SELECT l.id, l.battle_id, l.status, l.price_cents, l.stems_price_cents, l.file_size, l.stems_size, l.genre, l.bpm, l.updated_at,
			        b.title, u.username, u.created_at AS joined, u.wins, u.losses
			 FROM listings l JOIN battles b ON b.id = l.battle_id JOIN users u ON u.id = l.seller_id
			 WHERE l.status = ? ORDER BY l.price_cents DESC NULLS LAST, l.updated_at DESC LIMIT 200`
		)
			.bind(status)
			.all<{ id: string; battle_id: string; status: string; price_cents: number | null; stems_price_cents: number | null; file_size: number | null; stems_size: number | null; genre: string | null; bpm: number | null; updated_at: number; title: string; username: string; joined: number; wins: number; losses: number }>()
	]);
	const services =
		status === 'services'
			? (
					await db
						.prepare(
							`SELECT s.id, s.title, s.category, s.status, s.price_from_cents, s.updated_at, u.username,
							        (SELECT COUNT(*) FROM service_samples x WHERE x.service_id = s.id) AS samples
							 FROM services s JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 200`
						)
						.all<{ id: string; title: string; category: string; status: string; price_from_cents: number; updated_at: number; username: string; samples: number }>()
				).results
			: [];
	return {
		services,
		isAdmin: me.isAdmin,
		settings,
		counts: Object.fromEntries(counts.results.map((c) => [c.status, c.n])) as Record<string, number>,
		medianCents: median?.price_cents ?? null,
		status,
		listings: rows.results,
		now: Date.now()
	};
};

export const actions: Actions = {
	settings: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const db = getEnv().DB;
		const f = await request.formData();
		const fee = Number(f.get('fee'));
		const min = Math.round(Number(String(f.get('min') ?? '').replace(/[$,\s]/g, '')) * 100);
		if (!Number.isFinite(fee) || fee < 0 || fee > 50) return fail(400, { error: 'Fee must be 0–50%.' });
		if (!Number.isFinite(min) || min < 0 || min > 100_000) return fail(400, { error: 'Suggested minimum must be $0–$1,000.' });
		await setSetting(db, FEE_KEY, String(Math.round(fee * 10) / 10), admin.username);
		await setSetting(db, MIN_PRICE_KEY, String(min), admin.username);
		await logAction(db, admin, 'settings.store', 'settings', 'store', `fee ${fee}%, suggested min $${min / 100}`);
		return { ok: `Saved: ${fee}% fee, $${(min / 100).toFixed(0)} suggested minimum. New sales use these right away.` };
	},

	remove: async ({ request, locals }) => {
		const me = requireMod(locals);
		const db = getEnv().DB;
		const f = await request.formData();
		const id = String(f.get('id'));
		const reason = String(f.get('note') ?? '').trim().slice(0, 300);
		if (!reason) return fail(400, { error: 'Add a reason.' });
		const l = await db.prepare(`SELECT status FROM listings WHERE id = ?`).bind(id).first<{ status: string }>();
		if (!l) return fail(404, { error: 'Listing not found.' });
		if (l.status === 'sold') return fail(400, { error: "Sold listings can't be removed here." });
		await db.prepare(`UPDATE listings SET status = 'removed', updated_at = ? WHERE id = ?`).bind(Date.now(), id).run();
		await logAction(db, me, 'listing.remove', 'listing', id, reason);
		return { ok: 'Listing removed from the store.' };
	},

	removeService: async ({ request, locals }) => {
		const me = requireMod(locals);
		const db = getEnv().DB;
		const f = await request.formData();
		const id = String(f.get('id'));
		const reason = String(f.get('note') ?? '').trim().slice(0, 300);
		if (!reason) return fail(400, { error: 'Add a reason.' });
		await db.prepare(`UPDATE services SET status = 'removed', updated_at = ? WHERE id = ?`).bind(Date.now(), id).run();
		await logAction(db, me, 'service.remove', 'service', id, reason);
		return { ok: 'Service removed.' };
	},

	restore: async ({ request, locals }) => {
		const me = requireMod(locals);
		const db = getEnv().DB;
		const id = String((await request.formData()).get('id'));
		await db.prepare(`UPDATE listings SET status = 'unlisted', updated_at = ? WHERE id = ? AND status = 'removed'`).bind(Date.now(), id).run();
		await logAction(db, me, 'listing.restore', 'listing', id);
		return { ok: 'Restored as "off the store" — the producer can relist it.' };
	}
};
