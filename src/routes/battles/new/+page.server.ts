import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { storeAudio } from '#lib/server/battles.ts';
import { getEnv, newId } from '#lib/server/util.ts';
import { creatorColor } from '#lib/colors.ts';

const MAX_OPEN_PER_USER = 3;

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
};

export const actions: Actions = {
	default: async ({ request, locals, platform }) => {
		if (!locals.user) return fail(401, { error: 'Log in first.' });
		const env = getEnv(platform);
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const voteHours = Number(form.get('vote_hours'));

		if (title.length < 3 || title.length > 80) return fail(400, { error: 'Title must be 3–80 characters.' });
		if (voteHours !== 24 && voteHours !== 48) return fail(400, { error: 'Pick a voting window.' });
		if (form.get('ack_rights') !== 'on') return fail(400, { error: 'Please confirm the copyright notice.' });

		const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM battles WHERE creator_id = ? AND status = 'open'`)
			.bind(locals.user.id)
			.first<{ n: number }>();
		if ((open?.n ?? 0) >= MAX_OPEN_PER_USER) {
			return fail(400, { error: `You already have ${MAX_OPEN_PER_USER} battles waiting for a challenger.` });
		}

		const audio = await storeAudio(env.AUDIO, form.get('audio') as File, String(form.get('peaks') ?? ''));
		if (typeof audio === 'string') return fail(400, { error: audio });

		const battleId = newId(8);
		const now = Date.now();
		const me = await env.DB.prepare('SELECT color FROM users WHERE id = ?').bind(locals.user.id).first<{ color: string | null }>();
		const colorA = creatorColor(battleId, me?.color);
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO battles (id, title, creator_id, status, vote_hours, created_at, color_a) VALUES (?, ?, ?, 'open', ?, ?, ?)`
			).bind(battleId, title, locals.user.id, voteHours, now, colorA),
			env.DB.prepare(
				`INSERT INTO entries (id, battle_id, user_id, slot, audio_key, duration_ms, peaks, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)`
			).bind(newId(), battleId, locals.user.id, audio.key, audio.durationMs, audio.peaks, now)
		]);
		redirect(303, `/battles/${battleId}`);
	}
};
