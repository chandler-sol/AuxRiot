import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { CREDITS, getMinVotes } from '#lib/server/credits.ts';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const db = getEnv(platform).DB;
	const [me, ledger, promotable, minVotes] = await Promise.all([
		db.prepare('SELECT credits FROM users WHERE id = ?').bind(locals.user.id).first<{ credits: number }>(),
		db
			.prepare(
				`SELECT l.amount, l.reason, l.ref, l.note, l.created_at, b.title, c.username AS creator, ch.username AS challenger
				 FROM credit_ledger l
				 LEFT JOIN battles b ON b.id = l.ref
				 LEFT JOIN users c ON c.id = b.creator_id
				 LEFT JOIN users ch ON ch.id = b.challenger_id
				 WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT 60`
			)
			.bind(locals.user.id)
			.all<{ amount: number; reason: string; ref: string; note: string; created_at: number; title: string | null; creator: string | null; challenger: string | null }>(),
		db
			.prepare(
				`SELECT b.id, b.title, b.status, c.username AS creator, ch.username AS challenger FROM battles b
				 JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id
				 WHERE (b.creator_id = ? OR b.challenger_id = ?) AND b.status IN ('open', 'voting')
				 ORDER BY b.created_at DESC LIMIT 10`
			)
			.bind(locals.user.id, locals.user.id)
			.all<{ id: string; title: string; status: string; creator: string; challenger: string | null }>(),
		getMinVotes(db)
	]);
	return { balance: me?.credits ?? 0, ledger: ledger.results, promotable: promotable.results, rules: CREDITS, minVotes };
};
