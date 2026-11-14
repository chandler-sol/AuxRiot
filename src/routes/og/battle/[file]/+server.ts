import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { renderBattleOg } from '#lib/server/ogimage.ts';
import type { BattleResult } from '#lib/server/battles.ts';

const VERSION = 'v4';

/**
 * Per-battle share image. Rendered once per battle state (open → live → final)
 * and cached in R2, so the renderer runs a handful of times per battle.
 */
export const GET: RequestHandler = async ({ params, platform }) => {
	const id = params.file.match(/^([A-Za-z0-9_-]+)\.png$/)?.[1];
	if (!id) error(404);
	const env = getEnv(platform);
	const b = await env.DB.prepare(
		`SELECT b.id, b.title, b.status, b.vote_hours, b.rounds, b.color_a, b.color_b, b.winner_id, b.creator_id, b.result_json,
		        c.username AS creator, ch.username AS challenger
		 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id WHERE b.id = ?`
	)
		.bind(id)
		.first<{
			id: string; title: string; status: string; vote_hours: number; rounds: number; color_a: string | null; color_b: string | null;
			winner_id: string | null; creator_id: string; result_json: string | null; creator: string; challenger: string | null;
		}>();
	if (!b || b.status === 'removed') return Response.redirect('https://auxriot.com/og-v2.png', 302);

	const state = [b.status, b.challenger ?? '', b.winner_id ?? '', b.color_a ?? '', b.color_b ?? ''].join('-');
	const key = `og/${b.id}/${VERSION}-${encodeURIComponent(state)}.png`;
	const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600' };

	const cached = await env.AUDIO.get(key);
	if (cached) return new Response(cached.body as unknown as ReadableStream, { headers });

	const result = b.result_json ? (JSON.parse(b.result_json) as BattleResult) : null;
	const png = await renderBattleOg({
		id: b.id,
		title: b.title,
		status: b.status,
		creator: b.creator,
		challenger: b.challenger,
		winner: b.winner_id ? (b.winner_id === b.creator_id ? b.creator : b.challenger) : null,
		colorA: b.color_a,
		colorB: b.color_b,
		scores: result ? [result.slots[0].total, result.slots[1].total] : null,
		voteHours: b.vote_hours,
		rounds: b.rounds
	});
	await env.AUDIO.put(key, png, { httpMetadata: { contentType: 'image/png' } });
	return new Response(png, { headers });
};
