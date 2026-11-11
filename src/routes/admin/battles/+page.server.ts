import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { requireMod } from '#lib/server/mod.ts';
import { finalizeDue } from '#lib/server/battles.ts';

const STATUSES = ['voting', 'open', 'closed', 'removed', 'expired', 'all'] as const;
const SORTS = {
	ending: "CASE WHEN b.status = 'voting' THEN b.voting_ends_at ELSE 9e15 END ASC, b.created_at DESC",
	newest: 'b.created_at DESC',
	flagged: 'flagged DESC, b.created_at DESC',
	reports: 'reports DESC, b.created_at DESC',
	votes: 'votes DESC, b.created_at DESC'
} as const;

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	requireMod(locals);
	const env = getEnv(platform);
	await finalizeDue(env.DB, Number(env.OPEN_BATTLE_EXPIRY_DAYS || 14));
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
	const s = url.searchParams.get('status');
	const status = (STATUSES as readonly string[]).includes(s ?? '') ? (s as (typeof STATUSES)[number]) : 'voting';
	const so = url.searchParams.get('sort');
	const sort = (so && so in SORTS ? so : status === 'voting' ? 'ending' : 'newest') as keyof typeof SORTS;

	const where: string[] = [];
	const binds: unknown[] = [];
	if (status !== 'all') {
		where.push('b.status = ?');
		binds.push(status);
	}
	if (q) {
		where.push('(b.title LIKE ? OR c.username LIKE ? OR ch.username LIKE ? OR b.id = ?)');
		binds.push(`%${q}%`, `%${q}%`, `%${q}%`, q.match(/battles\/([A-Za-z0-9_-]+)/)?.[1] ?? q);
	}
	const rows = await env.DB.prepare(
		`SELECT b.id, b.title, b.status, b.created_at, b.voting_ends_at, b.winner_id, b.creator_id, b.color_a, b.color_b,
		        c.username AS creator, ch.username AS challenger,
		        (SELECT COUNT(*) FROM votes v WHERE v.battle_id = b.id) AS votes,
		        (SELECT COUNT(*) FROM votes v WHERE v.battle_id = b.id AND v.weight < 1) AS flagged,
		        (SELECT COUNT(*) FROM comments m WHERE m.battle_id = b.id) AS comments,
		        (SELECT COUNT(*) FROM reports r WHERE r.status = 'open' AND (
		           (r.target_type = 'battle' AND r.target_id = b.id) OR
		           (r.target_type = 'comment' AND r.target_id IN (SELECT id FROM comments WHERE battle_id = b.id)))) AS reports
		 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id
		 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
		 ORDER BY ${SORTS[sort]} LIMIT 100`
	)
		.bind(...binds)
		.all<{
			id: string; title: string; status: string; created_at: number; voting_ends_at: number | null; winner_id: string | null;
			creator_id: string; color_a: string | null; color_b: string | null; creator: string; challenger: string | null;
			votes: number; flagged: number; comments: number; reports: number;
		}>();
	return { battles: rows.results, q, status, sort, now: Date.now() };
};
