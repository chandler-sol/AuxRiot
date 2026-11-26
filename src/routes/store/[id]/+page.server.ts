import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { ITEM_SELECT, toItem, withBuy, type ItemRow } from '#lib/server/storequery.ts';
import { checkoutLive } from '#lib/server/stripe.ts';
import { cancelPending, startCheckout } from '#lib/server/checkout.ts';
import { answerQuestion, askQuestion, listQuestions } from '#lib/server/questions.ts';
import { money } from '#lib/store.ts';

/** One beat for sale: player, details, buy, Q&A, and the battle it came from. */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	const env = getEnv();
	const db = env.DB;
	const viewer = locals.user?.id ?? null;
	const row = await db.prepare(`${ITEM_SELECT} WHERE l.id = ?`).bind(params.id).first<ItemRow>();
	if (!row || (row.status !== 'listed' && row.status !== 'sold' && row.seller_id !== viewer)) error(404, 'This beat is not in the store.');
	// Back from Stripe without paying: free the beat right away.
	if (viewer && url.searchParams.get('canceled')) await cancelPending(db, url.searchParams.get('canceled')!, viewer);

	const live = checkoutLive(env);
	const [item] = withBuy([toItem(row)], live, viewer);
	const battle = await db
		.prepare(
			`SELECT b.id, b.title, b.status, b.winner_id, b.result_json, b.rounds, b.creator_id, b.challenger_id, c.username AS creator, ch.username AS challenger
			 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id WHERE b.id = ?`
		)
		.bind(row.battle_id)
		.first<{ id: string; title: string; status: string; winner_id: string | null; result_json: string | null; rounds: number; creator_id: string; challenger_id: string | null; creator: string; challenger: string | null }>();
	const mineSlot = battle?.creator_id === row.seller_id ? 0 : 1;
	const totals = battle?.result_json ? (JSON.parse(battle.result_json) as { slots: { total: number }[] }).slots.map((x) => x.total) : null;
	const more = await db
		.prepare(`${ITEM_SELECT} WHERE l.seller_id = ? AND l.id != ? AND l.status = 'listed' AND b.status != 'removed' ORDER BY l.updated_at DESC LIMIT 4`)
		.bind(row.seller_id, row.id)
		.all<ItemRow>();

	return {
		item,
		checkoutLive: live,
		questions: await listQuestions(db, [row.id], viewer),
		battle: battle && {
			id: battle.id,
			title: battle.title,
			status: battle.status,
			opponent: mineSlot === 0 ? battle.challenger : battle.creator,
			outcome: battle.status !== 'closed' ? null : battle.winner_id === null ? 'tie' : battle.winner_id === row.seller_id ? 'won' : 'lost',
			score: totals ? [totals[mineSlot], totals[1 - mineSlot]] : null
		},
		more: withBuy(more.results.map(toItem), live, viewer),
		og: {
			title: `"${row.title}" by ${row.username} · ${money(row.price_cents)} exclusive · AuxRiot`,
			description: `An exclusive beat that battled on AuxRiot${item.won ? ' — and won' : ''}. One buyer, then it's gone.`
		}
	};
};

export const actions: Actions = {
	buy: async ({ request, locals, params, url }) => {
		if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
		const f = await request.formData();
		if (f.get('agree') !== 'on') return fail(400, { buyError: 'Agree to the Exclusive Beat License to continue.' });
		const r = await startCheckout(getEnv(), locals.user, params.id, {
			stems: f.get('stems') === '1',
			legalName: String(f.get('legal_name') ?? ''),
			origin: url.origin,
			returnPath: `/store/${params.id}`
		});
		if ('error' in r) return fail(400, { buyError: r.error });
		redirect(303, r.url, { external: true });
	},
	ask: async ({ request, locals, params, url }) => {
		if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
		const body = String((await request.formData()).get('body') ?? '').trim();
		const err = await askQuestion(getEnv().DB, locals.user, params.id, body);
		if (err) return fail(400, { qError: err, qBody: body });
		return { asked: true };
	},
	answer: async ({ request, locals, url }) => {
		if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
		const f = await request.formData();
		const id = String(f.get('question_id') ?? '');
		const err = await answerQuestion(getEnv().DB, locals.user, id, String(f.get('answer') ?? '').trim());
		if (err) return fail(400, { aError: err, aId: id });
		return { answered: id };
	}
};
