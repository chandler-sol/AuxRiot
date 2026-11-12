import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { creatorColor } from '#lib/colors.ts';

/** Shareable challenge page: "Come battle me." 30-second teaser + one tap to answer or sign up. */
export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = getEnv(platform).DB;
	const b = await db
		.prepare(
			`SELECT b.id, b.title, b.status, b.vote_hours, b.created_at, b.color_a, b.creator_id,
			        u.username, u.avatar_key, u.color, u.wins, u.losses, u.ties, u.bio,
			        e.audio_key, e.duration_ms, e.peaks, e.removed
			 FROM battles b JOIN users u ON u.id = b.creator_id
			 JOIN entries e ON e.battle_id = b.id AND e.slot = 0
			 WHERE b.id = ?`
		)
		.bind(params.id)
		.first<{
			id: string; title: string; status: string; vote_hours: number; created_at: number; color_a: string | null; creator_id: string;
			username: string; avatar_key: string | null; color: string | null; wins: number; losses: number; ties: number; bio: string;
			audio_key: string; duration_ms: number; peaks: string; removed: number;
		}>();
	if (!b || b.status === 'removed' || b.removed) error(404, 'Challenge not found');
	// Already answered or finished: the battle page is the right place.
	if (b.status !== 'open') redirect(303, `/battles/${b.id}`);

	const isCreator = locals.user?.id === b.creator_id;
	return {
		challenge: {
			id: b.id,
			title: b.title,
			voteHours: b.vote_hours,
			createdAt: b.created_at,
			color: b.color_a ?? creatorColor(b.id, b.color),
			creator: { username: b.username, avatarKey: b.avatar_key, color: b.color, wins: b.wins, losses: b.losses, ties: b.ties, bio: b.bio },
			src: `/audio/${b.audio_key}`,
			durationMs: b.duration_ms,
			peaks: JSON.parse(b.peaks) as number[]
		},
		isCreator,
		loggedIn: !!locals.user,
		og: {
			title: `${b.username} wants smoke — come battle on AuxRiot`,
			description: `"${b.title}" — hear 30 seconds, then answer with your own beat. First producer to step up takes the slot.`,
			image: `/og/battle/${b.id}.png`
		}
	};
};
