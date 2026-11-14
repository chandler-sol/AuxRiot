import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { storeAudio, type UploadedAudio } from '#lib/server/battles.ts';
import { createSession } from '#lib/server/auth.ts';
import { isRounds } from '#lib/battleformat.ts';
import {
	guardSeed, createTestUsers, seedBattle, addJudges, endNow, answerWithTestUser, dropOvertime, listTestBeats,
	wipeTestData, returnCookie, type Stage, type Lean
} from '#lib/server/seed.ts';

export const load: PageServerLoad = async ({ locals }) => {
	const env = getEnv();
	guardSeed(env, locals);
	const db = env.DB;
	const [users, battles, stats] = await Promise.all([
		db.prepare(
			`SELECT u.id, u.username, u.created_at,
			   (SELECT COUNT(*) FROM entries e WHERE e.user_id = u.id) AS beats,
			   (SELECT COUNT(*) FROM listings l WHERE l.seller_id = u.id AND l.status = 'listed') AS listed
			 FROM users u WHERE u.is_test = 1 ORDER BY u.created_at DESC LIMIT 60`
		).all<{ id: string; username: string; created_at: number; beats: number; listed: number }>(),
		db.prepare(
			`SELECT b.id, b.title, b.status, b.rounds, b.ot_status, b.voting_ends_at,
			   (SELECT COUNT(*) FROM votes v WHERE v.battle_id = b.id) AS votes
			 FROM battles b WHERE b.creator_id IN (SELECT id FROM users WHERE is_test = 1) OR b.challenger_id IN (SELECT id FROM users WHERE is_test = 1)
			   OR b.status IN ('open', 'voting', 'overtime')
			 ORDER BY b.created_at DESC LIMIT 40`
		).all<{ id: string; title: string; status: string; rounds: number; ot_status: string | null; voting_ends_at: number | null; votes: number }>(),
		db.prepare(
			`SELECT (SELECT COUNT(*) FROM users WHERE is_test = 1) AS users,
			   (SELECT COUNT(*) FROM listings l JOIN users u ON u.id = l.seller_id WHERE u.is_test = 1 AND l.status = 'listed') AS listed`
		).first<{ users: number; listed: number }>()
	]);
	return { users: users.results, battles: battles.results, stats };
};

/** Generated beats arrive as audio_0..n with peaks_0..n, same checks as a real upload. */
async function readBeats(env: Env, form: FormData) {
	const out: UploadedAudio[] = [];
	for (let i = 0; form.get(`audio_${i}`); i++) {
		const a = await storeAudio(env.AUDIO, form.get(`audio_${i}`) as File, String(form.get(`peaks_${i}`) ?? ''));
		if (typeof a === 'string') throw new Error(`Beat ${i + 1}: ${a}`);
		out.push(a);
	}
	return out;
}

const STAGES: Stage[] = ['open', 'voting', 'results', 'overtime', 'ot_voting'];
const LEANS: Lean[] = ['random', 'a', 'b', 'close', 'tie'];
const num = (v: FormDataEntryValue | null, lo: number, hi: number, d: number) => {
	const n = Number(v);
	return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d;
};

async function run<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		return fail(400, { error: e instanceof Error ? e.message : String(e) });
	}
}

export const actions: Actions = {
	users: async ({ request, locals }) => {
		const env = getEnv();
		guardSeed(env, locals);
		const n = num((await request.formData()).get('count'), 1, 50, 5);
		return run(async () => ({ ok: `Created ${(await createTestUsers(env.DB, n)).length} test producers.` }));
	},

	battle: async ({ request, locals }) => {
		const env = getEnv();
		const admin = guardSeed(env, locals);
		const f = await request.formData();
		const rounds = Number(f.get('rounds'));
		const stage = String(f.get('stage')) as Stage;
		if (!isRounds(rounds) || !STAGES.includes(stage)) return fail(400, { error: 'Pick a format and stage.' });
		const lean = (LEANS.includes(String(f.get('lean')) as Lean) ? String(f.get('lean')) : 'random') as Lean;
		const me = (['creator', 'challenger'].includes(String(f.get('me'))) ? String(f.get('me')) : 'none') as 'none' | 'creator' | 'challenger';
		return run(async () => {
			const id = await seedBattle(env.DB, admin, {
				rounds, stage, lean, me,
				judges: num(f.get('judges'), 0, 30, 3),
				wantsOt: f.get('wants_ot') === 'on',
				sell: f.get('sell') === 'on'
			}, await readBeats(env, f));
			if (f.get('sell') === 'on') await listTestBeats(env.DB, id, env.AUDIO);
			return { ok: 'Battle created.', battleId: id };
		});
	},

	judges: async ({ request, locals }) => {
		const env = getEnv();
		guardSeed(env, locals);
		const f = await request.formData();
		const lean = (LEANS.includes(String(f.get('lean')) as Lean) ? String(f.get('lean')) : 'random') as Lean;
		return run(async () => ({
			ok: `Added ${await addJudges(env.DB, String(f.get('battle')), num(f.get('judges'), 1, 30, 3), lean, f.get('wants_ot') === 'on')} judges.`
		}));
	},

	end: async ({ request, locals }) => {
		const env = getEnv();
		guardSeed(env, locals);
		const id = String((await request.formData()).get('battle'));
		return run(async () => ({ ok: `Fast-forwarded. The battle is now ${await endNow(env.DB, id)}.` }));
	},

	answer: async ({ request, locals }) => {
		const env = getEnv();
		guardSeed(env, locals);
		const f = await request.formData();
		return run(async () => ({ ok: `${await answerWithTestUser(env.DB, String(f.get('battle')), await readBeats(env, f))} answered it.` }));
	},

	overtime: async ({ request, locals }) => {
		const env = getEnv();
		guardSeed(env, locals);
		const f = await request.formData();
		const side = (['a', 'b'].includes(String(f.get('side'))) ? String(f.get('side')) : 'both') as 'a' | 'b' | 'both';
		return run(async () => {
			await dropOvertime(env.DB, String(f.get('battle')), side, await readBeats(env, f));
			return { ok: side === 'both' ? 'Both overtime beats dropped — the overtime vote is open.' : `Side ${side.toUpperCase()} dropped an overtime beat.` };
		});
	},

	sell: async ({ request, locals }) => {
		const env = getEnv();
		guardSeed(env, locals);
		const id = String((await request.formData()).get('battle') ?? '').trim();
		return run(async () => ({ ok: `Listed ${await listTestBeats(env.DB, id || undefined, env.AUDIO)} test beats in the store.` }));
	},

	loginAs: async ({ request, locals, cookies, url }) => {
		const env = getEnv();
		const admin = guardSeed(env, locals);
		const uid = String((await request.formData()).get('user'));
		const u = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_test = 1').bind(uid).first();
		if (!u) return fail(400, { error: 'Not a test user.' });
		const back = await returnCookie(env.SIGNAL_SALT ?? 'dev-salt', admin.id);
		cookies.set(back.name, back.value, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 86_400 });
		await createSession(env.DB, cookies, uid, url.protocol === 'https:');
		redirect(303, '/battles');
	},

	wipe: async ({ request, locals }) => {
		const env = getEnv();
		guardSeed(env, locals);
		if ((await request.formData()).get('confirm') !== 'WIPE') return fail(400, { error: 'Type WIPE to confirm.' });
		return run(async () => {
			const r = await wipeTestData(env.DB, env.AUDIO);
			return { ok: `Wiped ${r.users} test users, ${r.battles} battles and ${r.files} files.` };
		});
	}
};
