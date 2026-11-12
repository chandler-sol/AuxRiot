import type { PageServerLoad } from './$types';
import { finalizeDue } from '#lib/server/battles.ts';
import { getEnv } from '#lib/server/util.ts';
import { activePromotedIds } from '#lib/server/promos.ts';

const TABS = {
	voting: { where: `b.status = 'voting'`, sorts: ['ending', 'ending_last', 'newest', 'votes', 'comments', 'views'] },
	open: { where: `b.status = 'open'`, sorts: ['newest', 'oldest', 'comments', 'views'] },
	results: { where: `b.status = 'closed'`, sorts: ['newest', 'votes', 'comments', 'views'] }
} as const;

type Tab = keyof typeof TABS;
type Sort = 'ending' | 'ending_last' | 'newest' | 'oldest' | 'votes' | 'comments' | 'views';

const SORT_LABELS: Record<Sort, string> = {
	ending: 'Ending soonest',
	ending_last: 'Ending last',
	newest: 'Newest',
	oldest: 'Oldest',
	votes: 'Most votes',
	comments: 'Most comments',
	views: 'Most views'
};

function orderBy(tab: Tab, sort: Sort): string {
	switch (sort) {
		case 'ending': return 'b.voting_ends_at ASC';
		case 'ending_last': return 'b.voting_ends_at DESC';
		case 'oldest': return 'b.created_at ASC';
		case 'votes': return 'votes DESC, b.created_at DESC';
		case 'comments': return 'comments DESC, b.created_at DESC';
		case 'views': return 'b.views DESC, b.created_at DESC';
		default:
			return tab === 'voting' ? 'b.voting_started_at DESC' : tab === 'results' ? 'b.voting_ends_at DESC' : 'b.created_at DESC';
	}
}

const BASE = `SELECT b.id, b.title, b.status, b.created_at, b.voting_ends_at, b.winner_id, b.vote_hours, b.result_json, b.color_a, b.color_b, b.challenger_id, b.views,
		        c.username AS creator, c.id AS creator_id, ch.username AS challenger,
		        (SELECT COUNT(*) FROM votes v WHERE v.battle_id = b.id) AS votes,
		        (SELECT COUNT(*) FROM comments m WHERE m.battle_id = b.id AND m.hidden = 0) AS comments
		 FROM battles b
		 JOIN users c ON c.id = b.creator_id
		 LEFT JOIN users ch ON ch.id = b.challenger_id`;

type Row = {
		id: string;
		title: string;
		status: string;
		created_at: number;
		voting_ends_at: number | null;
		winner_id: string | null;
		vote_hours: number;
		creator: string;
		creator_id: string;
		challenger_id: string | null;
		result_json: string | null;
		color_a: string | null;
		color_b: string | null;
		challenger: string | null;
		votes: number;
		comments: number;
	};

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = getEnv(platform);
	await finalizeDue(env.DB, Number(env.OPEN_BATTLE_EXPIRY_DAYS) || 5);

	const tabParam = url.searchParams.get('tab') ?? 'voting';
	const tab: Tab = tabParam in TABS ? (tabParam as Tab) : 'voting';
	const q = TABS[tab];
	const sortParam = url.searchParams.get('sort') as Sort | null;
	const sort: Sort = sortParam && (q.sorts as readonly string[]).includes(sortParam) ? sortParam : q.sorts[0];

	const now = Date.now();
	const promoIds = await activePromotedIds(env.DB, now);

	const rows = await env.DB.prepare(`${BASE} WHERE ${q.where} ORDER BY ${orderBy(tab, sort)} LIMIT 50`).all<Row>();
	const promoRows = promoIds.length
		? await env.DB.prepare(`${BASE} WHERE b.id IN (${promoIds.map(() => '?').join(',')})`)
				.bind(...promoIds)
				.all<Row>()
		: { results: [] as Row[] };

	const counts = await env.DB.prepare(
		`SELECT (SELECT COUNT(*) FROM battles WHERE status = 'voting') AS live,
		        (SELECT COUNT(*) FROM battles WHERE status = 'open') AS open,
		        (SELECT COUNT(DISTINCT user_id) FROM entries) AS producers`
	).first<{ live: number; open: number; producers: number }>();

	const shape = ({ result_json, ...b }: Row) => {
		let score: [number, number] | null = null;
		if (result_json) {
			const r = JSON.parse(result_json) as { slots: { total: number }[] };
			score = [r.slots[0].total, r.slots[1].total];
		}
		return { ...b, score };
	};
	const battles = rows.results.filter((r) => !promoIds.includes(r.id)).map(shape);
	const promoted = promoIds.map((id) => promoRows.results.find((r) => r.id === id)).filter((r): r is Row => !!r).map(shape);

	return {
		og: {
			title: `Tonight's card · ${counts?.live ?? 0} live on AuxRiot`,
			description: 'Live votes, open challenges and fresh results. Hear both beats, then score them.'
		},
		tab,
		sort,
		sorts: q.sorts.map((k) => ({ key: k, label: SORT_LABELS[k] })),
		battles,
		promoted,
		counts: counts ?? { live: 0, open: 0, producers: 0 },
		now
	};
};
