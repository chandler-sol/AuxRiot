import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { battleColors } from '#lib/colors.ts';

/** Landing page for visitors. Logged-in users go straight to the feed. */
export const load: PageServerLoad = async ({ locals, platform }) => {
	if (locals.user) redirect(307, '/battles');
	const db = getEnv(platform).DB;

	// Five beats to sample: live battles first, then the most-viewed recent ones, one beat per producer.
	const rows = await db
		.prepare(
			`SELECT e.id, e.audio_key, e.duration_ms, e.peaks, e.slot, e.user_id,
			        b.id AS battle_id, b.status, b.color_a, b.color_b,
			        u.username, c.username AS creator, ch.username AS challenger
			 FROM entries e
			 JOIN battles b ON b.id = e.battle_id
			 JOIN users u ON u.id = e.user_id
			 JOIN users c ON c.id = b.creator_id
			 LEFT JOIN users ch ON ch.id = b.challenger_id
			 WHERE e.removed = 0 AND b.status IN ('voting', 'open', 'closed') AND u.shadowbanned = 0
			 ORDER BY (b.status = 'voting') DESC, b.views DESC, e.created_at DESC
			 LIMIT 40`
		)
		.all<{
			id: string;
			audio_key: string;
			duration_ms: number;
			peaks: string;
			slot: number;
			user_id: string;
			battle_id: string;
			status: string;
			color_a: string | null;
			color_b: string | null;
			username: string;
			creator: string;
			challenger: string | null;
		}>();

	const seen = new Set<string>();
	const samples = [];
	for (const r of rows.results) {
		if (seen.has(r.user_id)) continue;
		seen.add(r.user_id);
		samples.push({
			id: r.id,
			src: `/audio/${r.audio_key}`,
			durationMs: r.duration_ms,
			peaks: JSON.parse(r.peaks) as number[],
			color: battleColors(r.battle_id, r.color_a, r.color_b)[r.slot],
			name: r.username,
			battleId: r.battle_id,
			status: r.status,
			matchup: `${r.creator} vs ${r.challenger ?? '???'}`
		});
		if (samples.length === 5) break;
	}

	const stats = await db
		.prepare(
			`SELECT (SELECT COUNT(*) FROM battles WHERE status IN ('voting', 'closed')) AS battles,
			        (SELECT COUNT(DISTINCT user_id) FROM entries) AS producers,
			        (SELECT COUNT(*) FROM votes) AS votes,
			        (SELECT COUNT(*) FROM battles WHERE status = 'voting') AS live`
		)
		.first<{ battles: number; producers: number; votes: number; live: number }>();

	return { samples, stats: stats ?? { battles: 0, producers: 0, votes: 0, live: 0 } };
};
