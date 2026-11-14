import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { loadServices } from '#lib/server/services.ts';
import { SERVICE_CATEGORIES, isCategory } from '#lib/services.ts';

const SORTS = {
	newest: 's.updated_at DESC',
	price_low: 's.price_from_cents ASC, s.updated_at DESC',
	reputation: 'u.respect DESC, u.wins DESC, s.updated_at DESC',
	fastest: 's.turnaround_days ASC, s.updated_at DESC'
} as const;

export const load: PageServerLoad = async ({ url, locals }) => {
	const db = getEnv().DB;
	const p = url.searchParams;
	const category = isCategory(p.get('category') ?? '') ? p.get('category')! : '';
	const max = Number(p.get('max')) || 0;
	const q = (p.get('q') ?? '').trim().slice(0, 60);
	const sortParam = p.get('sort') ?? '';
	const sort: keyof typeof SORTS = sortParam in SORTS ? (sortParam as keyof typeof SORTS) : 'newest';

	const where = ["s.status = 'active'", 'u.suspended_at IS NULL', 'u.shadowbanned = 0'];
	const binds: unknown[] = [];
	if (category) where.push('s.category = ?'), binds.push(category);
	if (max) where.push('s.price_from_cents <= ?'), binds.push(Math.round(max * 100));
	if (q) where.push('(s.title LIKE ? OR s.description LIKE ? OR u.username LIKE ?)'), binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
	const services = await loadServices(db, where.join(' AND '), binds, SORTS[sort]);
	return {
		services,
		filters: { category, max, q, sort },
		categories: SERVICE_CATEGORIES,
		meId: locals.user?.id ?? null,
		og: { title: 'Hire producers & engineers · AuxRiot', description: 'Mixing, mastering, custom beats and more — from producers with a battle record to back it up.' }
	};
};
