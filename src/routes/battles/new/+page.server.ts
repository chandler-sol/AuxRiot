import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { storeAudio } from '#lib/server/battles.ts';
import { getEnv, newId } from '#lib/server/util.ts';
import { creatorColor } from '#lib/colors.ts';
import { FORMATS, isRounds } from '#lib/battleformat.ts';

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
		const rounds = Number(form.get('rounds') ?? 1);
		if (!isRounds(rounds)) return fail(400, { error: 'Pick a format.' });

		if (title.length < 3 || title.length > 80) return fail(400, { error: 'Title must be 3–80 characters.' });
		if (!(FORMATS[rounds].hours as readonly number[]).includes(voteHours)) return fail(400, { error: 'Pick a voting window.' });
		if (form.get('ack_rights') !== 'on') return fail(400, { error: 'Please confirm the copyright notice.' });

		const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM battles WHERE creator_id = ? AND status = 'open'`)
			.bind(locals.user.id)
			.first<{ n: number }>();
		if ((open?.n ?? 0) >= MAX_OPEN_PER_USER) {
			return fail(400, { error: `You already have ${MAX_OPEN_PER_USER} battles waiting for a challenger.` });
		}

		const uid = locals.user.id;
		// One beat per round, in the order the producer set.
		const beats: Exclude<Awaited<ReturnType<typeof storeAudio>>, string>[] = [];
		for (let i = 0; i < rounds; i++) {
			const audio = await storeAudio(env.AUDIO, form.get(`audio_${i}`) as File, String(form.get(`peaks_${i}`) ?? ''));
			if (typeof audio === 'string') {
				for (const b of beats) await env.AUDIO.delete(b.key);
				return fail(400, { error: rounds > 1 ? `Round ${i + 1}: ${audio}` : audio });
			}
			beats.push(audio);
		}

		const battleId = newId(8);
		const now = Date.now();
		const me = await env.DB.prepare('SELECT color FROM users WHERE id = ?').bind(locals.user.id).first<{ color: string | null }>();
		const colorA = creatorColor(battleId, me?.color);
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO battles (id, title, creator_id, status, vote_hours, created_at, color_a, rounds) VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`
			).bind(battleId, title, locals.user.id, voteHours, now, colorA, rounds),
			...beats.map((b, i) =>
				env.DB.prepare(
					`INSERT INTO entries (id, battle_id, user_id, slot, round, audio_key, duration_ms, peaks, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`
				).bind(newId(), battleId, uid, i + 1, b.key, b.durationMs, b.peaks, now)
			)
		]);
		// "Sell this beat" ticked: go straight to the listing page (it can go live now; Buy unlocks after the battle).
		redirect(303, form.get('sell') === 'on' ? `/battles/${battleId}/sell` : `/battles/${battleId}`);
	}
};
