import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { ITEM_SELECT, toItem, type ItemRow } from '#lib/server/storequery.ts';
import { GENRES, KEYS } from '#lib/store.ts';

const SORTS = {
	newest: 'l.updated_at DESC',
	price_low: 'l.price_cents ASC, l.updated_at DESC',
	price_high: 'l.price_cents DESC, l.updated_at DESC',
	winners: "(b.status = 'closed' AND b.winner_id = l.seller_id) DESC, l.updated_at DESC"
} as const;

export const load: PageServerLoad = async ({ url }) => {
	const db = getEnv().DB;
	const p = url.searchParams;
	const q = (p.get('q') ?? '').trim().slice(0, 60);
	const genre = GENRES.includes(p.get('genre') ?? '') ? p.get('genre')! : '';
	const key = KEYS.includes(p.get('key') ?? '') ? p.get('key')! : '';
	const bpmMin = Number(p.get('bpm_min')) || 0;
	const bpmMax = Number(p.get('bpm_max')) || 0;
	const maxPrice = Number(p.get('max')) || 0;
	const stemsOnly = p.get('stems') === '1';
	const sortParam = p.get('sort') ?? '';
	const sort: keyof typeof SORTS = sortParam in SORTS ? (sortParam as keyof typeof SORTS) : 'newest';

	const where = ["l.status = 'listed'", 'u.suspended_at IS NULL', 'u.shadowbanned = 0', "b.status != 'removed'"];
	const binds: unknown[] = [];
	if (q) {
		where.push('(b.title LIKE ? OR u.username LIKE ?)');
		binds.push(`%${q}%`, `%${q}%`);
	}
	if (genre) where.push('l.genre = ?'), binds.push(genre);
	if (key) where.push('l.music_key = ?'), binds.push(key);
	if (bpmMin) where.push('l.bpm >= ?'), binds.push(bpmMin);
	if (bpmMax) where.push('l.bpm <= ?'), binds.push(bpmMax);
	if (maxPrice) where.push('l.price_cents <= ?'), binds.push(Math.round(maxPrice * 100));
	if (stemsOnly) where.push('l.stems_key IS NOT NULL AND l.stems_price_cents IS NOT NULL');

	const rows = await db
		.prepare(`${ITEM_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${SORTS[sort]} LIMIT 60`)
		.bind(...binds)
		.all<ItemRow>();

	const sellers = await db
		.prepare(
			`SELECT u.username, u.avatar_key, u.color, u.wins, u.losses, COUNT(*) AS n, MIN(l.price_cents) AS from_cents
			 FROM listings l JOIN users u ON u.id = l.seller_id
			 WHERE l.status = 'listed' AND u.suspended_at IS NULL AND u.shadowbanned = 0
			 GROUP BY u.id ORDER BY n DESC, u.wins DESC LIMIT 40`
		)
		.all<{ username: string; avatar_key: string | null; color: string | null; wins: number; losses: number; n: number; from_cents: number }>();

	return {
		items: rows.results.map(toItem),
		sellers: sellers.results,
		filters: { q, genre, key, bpmMin, bpmMax, maxPrice, stemsOnly, sort },
		options: { genres: GENRES, keys: KEYS },
		og: { title: 'Beat store · AuxRiot', description: 'Exclusive beats from producers who battle for it. One buyer per beat — when it sells, it is gone.' }
	};
};
