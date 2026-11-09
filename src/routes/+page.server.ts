import type { PageServerLoad } from './$types';
import { finalizeDue } from '#lib/server/battles.ts';
import { getEnv } from '#lib/server/util.ts';

const TABS = {
	voting: { where: `b.status = 'voting'`, order: 'b.voting_ends_at ASC' },
	open: { where: `b.status = 'open'`, order: 'b.created_at DESC' },
	results: { where: `b.status = 'closed'`, order: 'b.voting_ends_at DESC' }
} as const;

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = getEnv(platform);
	await finalizeDue(env.DB, Number(env.OPEN_BATTLE_EXPIRY_DAYS) || 14);

	const tab = (url.searchParams.get('tab') ?? 'voting') as keyof typeof TABS;
	const q = TABS[tab] ?? TABS.voting;

	const rows = await env.DB.prepare(
		`SELECT b.id, b.title, b.status, b.created_at, b.voting_ends_at, b.winner_id, b.vote_hours,
		        c.username AS creator, c.id AS creator_id, ch.username AS challenger,
		        (SELECT COUNT(*) FROM votes v WHERE v.battle_id = b.id) AS votes,
		        (SELECT COUNT(*) FROM comments m WHERE m.battle_id = b.id AND m.hidden = 0) AS comments
		 FROM battles b
		 JOIN users c ON c.id = b.creator_id
		 LEFT JOIN users ch ON ch.id = b.challenger_id
		 WHERE ${q.where}
		 ORDER BY ${q.order} LIMIT 50`
	).all<{
		id: string;
		title: string;
		status: string;
		created_at: number;
		voting_ends_at: number | null;
		winner_id: string | null;
		vote_hours: number;
		creator: string;
		creator_id: string;
		challenger: string | null;
		votes: number;
		comments: number;
	}>();

	return { tab: tab in TABS ? tab : 'voting', battles: rows.results, now: Date.now() };
};
