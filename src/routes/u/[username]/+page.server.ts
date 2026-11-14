import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { parseSocials } from '#lib/server/profile.ts';
import { ITEM_SELECT, toItem, type ItemRow } from '#lib/server/storequery.ts';
import { loadServices } from '#lib/server/services.ts';

export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = getEnv(platform).DB;
	const profile = await db
		.prepare('SELECT id, username, created_at, wins, losses, ties, avatar_key, bio, socials, color, respect FROM users WHERE username = ?')
		.bind(params.username)
		.first<{
			id: string;
			username: string;
			created_at: number;
			wins: number;
			losses: number;
			ties: number;
			avatar_key: string | null;
			bio: string;
			socials: string;
			color: string | null;
			respect: number;
		}>();
	if (!profile) error(404, 'User not found');

	const battles = await db
		.prepare(
			`SELECT b.id, b.title, b.status, b.created_at, b.winner_id, b.voting_ends_at, b.vote_hours, b.rounds, b.ot_status, b.ot_deadline, b.ot_ends_at, b.result_json, b.color_a, b.color_b, b.views,
			        b.creator_id, b.challenger_id, c.username AS creator, ch.username AS challenger,
			        (SELECT COUNT(*) FROM votes v WHERE v.battle_id = b.id) AS votes,
			        (SELECT COUNT(*) FROM comments m WHERE m.battle_id = b.id AND m.hidden = 0) AS comments
			 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id
			 WHERE (b.creator_id = ? OR b.challenger_id = ?) AND b.status != 'removed'
			 ORDER BY b.created_at DESC LIMIT 50`
		)
		.bind(profile.id, profile.id)
		.all<{
			id: string;
			title: string;
			status: string;
			created_at: number;
			winner_id: string | null;
			voting_ends_at: number | null;
			vote_hours: number;
			result_json: string | null;
			color_a: string | null;
			color_b: string | null;
			creator_id: string;
			challenger_id: string | null;
			creator: string;
			challenger: string | null;
			votes: number;
			comments: number;
			views: number;
		}>();

	// Storefront: beats on sale first, then recent sales (SOLD stamps are social proof).
	const store = await db
		.prepare(`${ITEM_SELECT} WHERE l.seller_id = ? AND l.status IN ('listed', 'sold') AND b.status != 'removed'
		          ORDER BY l.status = 'sold', l.updated_at DESC LIMIT 30`)
		.bind(profile.id)
		.all<ItemRow>();

	const services = await loadServices(db, "s.user_id = ? AND s.status = 'active'", [profile.id], 's.created_at ASC', 8);
	const judged = await db
		.prepare(`SELECT COUNT(*) AS n FROM votes v JOIN battles b ON b.id = v.battle_id WHERE v.voter_id = ? AND b.status = 'closed' AND v.weight > 0`)
		.bind(profile.id)
		.first<{ n: number }>();

	const { socials, ...rest } = profile;
	return {
		profile: { ...rest, socials: parseSocials(socials) },
		battles: battles.results.map(({ result_json, ...b }) => {
			const r = result_json ? (JSON.parse(result_json) as { slots: { total: number }[] }) : null;
			return { ...b, score: r ? ([r.slots[0].total, r.slots[1].total] as [number, number]) : null };
		}),
		store: store.results.map(toItem),
		services,
		judged: judged?.n ?? 0,
		meId: locals.user?.id ?? null,
		isMe: locals.user?.id === profile.id,
		og: {
			title: `${profile.username} · ${profile.wins}-${profile.losses}${profile.ties ? `-${profile.ties}` : ''} on AuxRiot`,
			description: profile.bio
				? `${profile.bio.slice(0, 150)}`
				: `${profile.username}'s battles and record on AuxRiot — 1v1 beat battles where the crowd decides.`
		},
		now: Date.now()
	};
};
