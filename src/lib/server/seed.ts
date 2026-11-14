/**
 * Beta-only test data: fake producers, battles at any stage, judges, overtime
 * and store listings. Everything hangs off users with is_test = 1, so one wipe
 * removes it all. Never reachable on the live site (see guardSeed).
 */
import { error } from '@sveltejs/kit';
import { newId, sha256 } from './util.ts';
import { castVote, finalizeBattle, finalizeOvertime, type Scores, type UploadedAudio } from './battles.ts';
import { saveOtVote, saveRoundVote, submitOvertime } from './multibeat.ts';
import { STORE_DOCS_VERSION } from './store.ts';
import { PALETTE, creatorColor, challengerColor } from '#lib/colors.ts';
import { FORMATS, OT_VOTE_HOURS, type Rounds } from '#lib/battleformat.ts';
import { GENRES, KEYS, MOODS } from '#lib/store.ts';

const DAY = 86_400_000;

export function guardSeed(env: Env, locals: App.Locals) {
	if (env.ENVIRONMENT !== 'beta' || !locals.user?.isAdmin) error(404);
	return locals.user;
}

// ---------------------------------------------------------------------------
// Fake producers

const ADJ = ['lofi', 'dusty', 'neon', 'velvet', 'cold', 'gritty', 'midnight', 'golden', 'static', 'haze', 'chrome', 'soul', 'bass', 'vinyl', 'echo', 'drift', 'smoke', 'ghost', 'sly', 'brass'];
const NOUN = ['ghost', 'chops', 'kid', 'prophet', 'tape', 'wolf', 'drums', 'saint', 'beats', 'lab', 'rider', 'monk', 'fox', 'king', 'loops', 'theory', 'wave', 'state', 'crate', 'baron'];
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

export type TestUser = { id: string; username: string; created_at: number; color: string | null };

export async function createTestUsers(db: D1Database, n: number): Promise<TestUser[]> {
	const out: TestUser[] = [];
	for (let i = 0; i < n; i++) {
		for (let tries = 0; tries < 8; tries++) {
			const username = `${pick(ADJ)}${pick(NOUN)}${int(1, 99)}`.slice(0, 20);
			const id = newId();
			const created = Date.now() - int(10, 60) * DAY;
			const color = pick(PALETTE).key;
			const res = await db
				.prepare(
					`INSERT OR IGNORE INTO users (id, username, email, password_hash, created_at, terms_accepted_at, email_verified_at, color, is_test, notify_battles, legal_name)
					 VALUES (?, ?, ?, '!test', ?, ?, ?, ?, 1, 0, ?)`
				)
				.bind(id, username, `${username.toLowerCase()}@test.invalid`, created, created, created, color, `Test Producer ${username}`)
				.run();
			if (res.meta.changes) {
				out.push({ id, username, created_at: created, color });
				break;
			}
		}
	}
	return out;
}

/** Test users not already in the given battle, topping up the pool when there aren't enough. */
async function testPool(db: D1Database, n: number, exclude: string[] = []) {
	const have = await db
		.prepare(`SELECT id, username, created_at, color FROM users WHERE is_test = 1 ORDER BY RANDOM() LIMIT ?`)
		.bind(n + exclude.length)
		.all<TestUser>();
	const pool = have.results.filter((u) => !exclude.includes(u.id)).slice(0, n);
	if (pool.length < n) pool.push(...(await createTestUsers(db, n - pool.length)));
	return pool;
}

const asSession = (u: TestUser): SessionUser => ({
	id: u.id, username: u.username, isAdmin: false, isMod: false, shadowbanned: false,
	createdAt: u.created_at, emailVerified: true, credits: 0, avatarKey: null, color: u.color
});

// ---------------------------------------------------------------------------
// Battles

export type Stage = 'open' | 'voting' | 'results' | 'overtime' | 'ot_voting';
export type Lean = 'random' | 'a' | 'b' | 'close' | 'tie';
export type BattleSpec = {
	rounds: Rounds;
	stage: Stage;
	judges: number;
	lean: Lean;
	wantsOt: boolean;
	me: 'none' | 'creator' | 'challenger';
	sell: boolean;
};

/** How many generated beats a battle needs, in upload order: creator rounds, challenger rounds, then overtime A + B. */
export function beatsNeeded(s: Pick<BattleSpec, 'rounds' | 'stage'>) {
	if (s.stage === 'open') return s.rounds;
	return s.rounds * 2 + (s.stage === 'ot_voting' ? 2 : 0);
}

const TITLES = ['Dusty soul chops', 'Late night drill', 'Rainy day lo-fi', 'Boom bap therapy', '808s at sunrise', 'Smoky jazz flip', 'Basement tapes', 'Neon highway', 'Ghost town trap', 'Velvet R&B', 'Cold world', 'Sample roulette'];

export async function seedBattle(db: D1Database, admin: SessionUser, spec: BattleSpec, beats: UploadedAudio[]) {
	const { rounds, stage } = spec;
	if (beats.length < beatsNeeded(spec)) throw new Error(`Need ${beatsNeeded(spec)} beats, got ${beats.length}.`);
	if ((stage === 'overtime' || stage === 'ot_voting') && rounds === 1) throw new Error('Overtime is for best of 3 / best of 5.');
	const fmt = FORMATS[rounds];
	const [p1, p2] = await testPool(db, 2);
	const meRow: TestUser = { id: admin.id, username: admin.username, created_at: admin.createdAt, color: admin.color };
	const creator = spec.me === 'creator' ? meRow : p1;
	const challenger = spec.me === 'challenger' ? meRow : p2;

	const id = newId();
	const now = Date.now();
	const hours = pick(fmt.hours as readonly number[]);
	const colorA = creatorColor(id, creator.color);
	const title = `${pick(TITLES)} ${rounds > 1 ? `(Bo${rounds}) ` : ''}#${int(10, 99)}`;
	const entry = (u: TestUser, slot: number, round: number, a: UploadedAudio, at: number) =>
		db.prepare(`INSERT INTO entries (id, battle_id, user_id, slot, round, audio_key, duration_ms, peaks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
			.bind(newId(), id, u.id, slot, round, a.key, a.durationMs, a.peaks, at);

	const stmts = [
		db.prepare(`INSERT INTO battles (id, title, creator_id, status, vote_hours, created_at, color_a, rounds) VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`)
			.bind(id, title, creator.id, hours, now - 3_600_000, colorA, rounds),
		...Array.from({ length: rounds }, (_, i) => entry(creator, 0, i + 1, beats[i], now - 3_600_000))
	];
	if (stage !== 'open') {
		const colorB = challengerColor(id, colorA, challenger.color);
		stmts.push(
			...Array.from({ length: rounds }, (_, i) => entry(challenger, 1, i + 1, beats[rounds + i], now)),
			db.prepare(`UPDATE battles SET challenger_id = ?, status = 'voting', voting_started_at = ?, voting_ends_at = ?, color_b = ? WHERE id = ?`)
				.bind(challenger.id, now, now + hours * 3_600_000, colorB, id)
		);
	}
	await db.batch(stmts);
	if (stage === 'open') return id;

	const lean: Lean = stage === 'overtime' || stage === 'ot_voting' ? 'tie' : spec.lean;
	const judges = Math.max(spec.judges, lean === 'tie' ? 2 : 0, stage === 'results' ? 1 : 0);
	await addJudges(db, id, judges, lean, spec.wantsOt);

	if (stage === 'voting') return id;
	await db.prepare('UPDATE battles SET voting_ends_at = ? WHERE id = ?').bind(now - 1000, id).run();
	await finalizeBattle(db, id);

	if (stage === 'ot_voting') {
		const b = await battleRow(db, id);
		if (b?.status === 'overtime') {
			for (const [i, u] of [creator, challenger].entries()) {
				await submitOvertime(db, b, u.id, beats[rounds * 2 + i], () => newId(), OT_VOTE_HOURS);
				b.ot_status = (await battleRow(db, id))?.ot_status ?? b.ot_status;
			}
		}
	}
	return id;
}

type Row = { id: string; creator_id: string; challenger_id: string; rounds: number; status: string; ot_status: string | null; ot_deadline: number | null };
const battleRow = (db: D1Database, id: string) =>
	db.prepare('SELECT id, creator_id, challenger_id, rounds, status, ot_status, ot_deadline FROM battles WHERE id = ?').bind(id).first<Row>();

function ballot(lean: Lean, i: number): Scores {
	const s = (base: number) => ({ drums: clamp(base + int(-1, 1)), melody: clamp(base + int(-1, 1)), mix: clamp(base + int(-1, 1)), overall: clamp(base + int(-1, 1)) });
	const clamp = (x: number) => Math.max(1, Math.min(5, x));
	const flat = (n: number) => ({ drums: n, melody: n, mix: n, overall: n });
	switch (lean) {
		case 'a': return [s(4), s(3)];
		case 'b': return [s(3), s(4)];
		case 'tie': return i % 2 ? [flat(3), flat(4)] : [flat(4), flat(3)];
		case 'close': return i % 2 ? [flat(3), flat(4)] : i % 3 ? [flat(4), flat(3)] : [flat(4), flat(4)];
		default: return [s(int(2, 4)), s(int(2, 4))];
	}
}

/** Add judges with full ballots (listens seeded so they pass the 75% rule). Ties need an even count. */
export async function addJudges(db: D1Database, battleId: string, n: number, lean: Lean, wantsOt: boolean) {
	const b = await battleRow(db, battleId);
	const ot = b?.status === 'overtime' && b.ot_status === 'voting';
	if (!b || (b.status !== 'voting' && !ot)) throw new Error('That battle is not taking votes.');
	const count = lean === 'tie' && n % 2 ? n + 1 : n;
	const judges = await testPool(db, count, [b.creator_id, b.challenger_id]);
	for (const [i, j] of judges.entries()) {
		await db
			.prepare(
				`INSERT OR REPLACE INTO listens (user_id, entry_id, first_at, last_at, listened_ms)
				 SELECT ?, id, ?, ?, duration_ms FROM entries WHERE battle_id = ? AND round <= ?`
			)
			.bind(j.id, Date.now(), Date.now(), battleId, b.rounds + (ot ? 1 : 0))
			.run();
		const scores = ballot(lean, i);
		if (ot) {
			await saveOtVote(db, asSession(j), b, scores);
		} else if (b.rounds > 1) {
			for (let r = 1; r <= b.rounds; r++) await saveRoundVote(db, asSession(j), b, r, scores, wantsOt);
		} else {
			await castVote(db, asSession(j), b, scores, wantsOt);
		}
	}
	return judges.length;
}

/** Fast-forward: close voting (or the overtime window / overtime vote) now. */
export async function endNow(db: D1Database, battleId: string) {
	const b = await battleRow(db, battleId);
	if (!b) throw new Error('No such battle.');
	if (b.status === 'voting') {
		await db.prepare('UPDATE battles SET voting_ends_at = ? WHERE id = ?').bind(Date.now() - 1000, battleId).run();
		await finalizeBattle(db, battleId);
	} else if (b.status === 'overtime') {
		const col = b.ot_status === 'offered' ? 'ot_deadline' : 'ot_ends_at';
		await db.prepare(`UPDATE battles SET ${col} = ? WHERE id = ?`).bind(Date.now() - 1000, battleId).run();
		await finalizeOvertime(db, battleId);
	} else throw new Error(`Nothing to end: the battle is ${b.status}.`);
	return (await battleRow(db, battleId))?.status;
}

/** A test producer answers an open battle. */
export async function answerWithTestUser(db: D1Database, battleId: string, beats: UploadedAudio[]) {
	const b = await db.prepare(`SELECT id, creator_id, rounds, vote_hours, color_a FROM battles WHERE id = ? AND status = 'open'`).bind(battleId).first<{ id: string; creator_id: string; rounds: number; vote_hours: number; color_a: string }>();
	if (!b) throw new Error('That battle is not open.');
	if (beats.length < b.rounds) throw new Error(`Need ${b.rounds} beats.`);
	const [u] = await testPool(db, 1, [b.creator_id]);
	const now = Date.now();
	await db.batch([
		...beats.slice(0, b.rounds).map((a, i) =>
			db.prepare(`INSERT INTO entries (id, battle_id, user_id, slot, round, audio_key, duration_ms, peaks, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`)
				.bind(newId(), b.id, u.id, i + 1, a.key, a.durationMs, a.peaks, now)
		),
		db.prepare(`UPDATE battles SET challenger_id = ?, status = 'voting', voting_started_at = ?, voting_ends_at = ?, color_b = ? WHERE id = ?`)
			.bind(u.id, now, now + b.vote_hours * 3_600_000, challengerColor(b.id, b.color_a, u.color), b.id)
	]);
	return u.username;
}

/** Test producers drop their overtime beats (both, or just one side to test forfeits). */
export async function dropOvertime(db: D1Database, battleId: string, side: 'a' | 'b' | 'both', beats: UploadedAudio[]) {
	const b = await battleRow(db, battleId);
	if (!b || b.status !== 'overtime' || b.ot_status !== 'offered') throw new Error('Overtime is not open for that battle.');
	const who = side === 'both' ? [b.creator_id, b.challenger_id] : [side === 'a' ? b.creator_id : b.challenger_id];
	const msgs: string[] = [];
	for (const [i, uid] of who.entries()) {
		const fresh = await battleRow(db, battleId);
		const err = await submitOvertime(db, fresh!, uid, beats[i], () => newId(), OT_VOTE_HOURS);
		if (err) msgs.push(err);
	}
	if (msgs.length) throw new Error(msgs.join(' '));
}

// ---------------------------------------------------------------------------
// Store

/** List every unlisted test-producer beat in a battle (or in all finished battles) as a ready-to-buy exclusive. */
export async function listTestBeats(db: D1Database, battleId?: string, bucket?: R2Bucket) {
	const rows = await db
		.prepare(
			`SELECT e.id AS entry_id, e.battle_id, e.user_id, e.audio_key FROM entries e
			 JOIN users u ON u.id = e.user_id AND u.is_test = 1
			 JOIN battles b ON b.id = e.battle_id
			 WHERE e.removed = 0 AND e.round <= b.rounds AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.entry_id = e.id)
			   AND ${battleId ? 'e.battle_id = ?' : "b.status IN ('closed', 'expired')"}
			 LIMIT 100`
		)
		.bind(...(battleId ? [battleId] : []))
		.all<{ entry_id: string; battle_id: string; user_id: string; audio_key: string }>();
	const now = Date.now();
	for (const r of rows.results) {
		const id = newId();
		let fileKey = r.audio_key;
		if (bucket) {
			// A separate copy as "the file buyers get", like a real upload.
			const obj = await bucket.get(r.audio_key);
			if (obj) {
				fileKey = `store/${id}/file-${newId(10)}.mp3`;
				await bucket.put(fileKey, await obj.arrayBuffer(), { httpMetadata: { contentType: 'audio/mpeg' } });
			}
		}
		const price = int(4, 16) * 500;
		const stems = Math.random() < 0.4 ? price + int(2, 6) * 500 : null;
		const name = await db.prepare('SELECT legal_name FROM users WHERE id = ?').bind(r.user_id).first<{ legal_name: string }>();
		await db.batch([
			db.prepare('UPDATE users SET seller_agreed_at = COALESCE(seller_agreed_at, ?), seller_agreement_version = ? WHERE id = ?').bind(now, STORE_DOCS_VERSION, r.user_id),
			db.prepare(
				`INSERT INTO listings (id, battle_id, entry_id, seller_id, status, price_cents, stems_price_cents, bpm, music_key, genre, moods,
				   file_key, file_name, file_size, file_format, tagged, stems_key, stems_name, stems_size, attested_at,
				   sample_disclosure, producer_signature, producer_signed_at, license_version, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 'listed', ?, ?, ?, ?, ?, ?, ?, 'beat.mp3', 0, 'mp3', 0, ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?)`
			).bind(
				id, r.battle_id, r.entry_id, r.user_id, price, stems, int(70, 160), pick(KEYS), pick(GENRES),
				[pick(MOODS), pick(MOODS)].filter((m, i, a) => a.indexOf(m) === i).join(','),
				fileKey, stems ? fileKey : null, stems ? 'stems.zip' : null, stems ? 0 : null, now,
				name?.legal_name ?? 'Test Producer', now, STORE_DOCS_VERSION, now, now
			)
		]);
	}
	return rows.results.length;
}

// ---------------------------------------------------------------------------
// Log in as a test user, and back

const RETURN_COOKIE = 'seed_return';
const returnSig = async (salt: string, adminId: string) => (await sha256(`${salt}:seed-return:${adminId}`)).slice(0, 32);

export async function returnCookie(salt: string, adminId: string) {
	return { name: RETURN_COOKIE, value: `${adminId}.${await returnSig(salt, adminId)}` };
}
export async function readReturnCookie(salt: string, raw: string | undefined) {
	if (!raw) return null;
	const [id, sig] = raw.split('.');
	return id && sig === (await returnSig(salt, id)) ? id : null;
}
export { RETURN_COOKIE };

// ---------------------------------------------------------------------------
// Wipe

type FK = { table: string; col: string; ref: string; refcol: string; notnull: boolean };

async function foreignKeys(db: D1Database): Promise<FK[]> {
	const tables = await db
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'`)
		.all<{ name: string }>();
	const out: FK[] = [];
	for (const { name } of tables.results) {
		const fks = await db.prepare(`PRAGMA foreign_key_list(${name})`).all<{ table: string; from: string; to: string }>();
		if (!fks.results.length) continue;
		const cols = await db.prepare(`PRAGMA table_info(${name})`).all<{ name: string; notnull: number }>();
		for (const f of fks.results) {
			out.push({ table: name, col: f.from, ref: f.table, refcol: f.to, notnull: !!cols.results.find((c) => c.name === f.from)?.notnull });
		}
	}
	return out;
}

/** Children first: rows pointing at deleted rows are deleted too, or unlinked when the link is optional. */
function plan(table: string, where: string, fks: FK[], out: string[], depth = 0) {
	if (depth > 8) throw new Error('Delete plan too deep.');
	for (const fk of fks.filter((f) => f.ref === table)) {
		const sub = `SELECT ${fk.refcol} FROM ${table} WHERE ${where}`;
		// A battle without its challenger makes no sense, so those always go.
		if (!fk.notnull && fk.table !== 'battles') out.push(`UPDATE ${fk.table} SET ${fk.col} = NULL WHERE ${fk.col} IN (${sub})`);
		else plan(fk.table, `${fk.col} IN (${sub})`, fks, out, depth + 1);
	}
	out.push(`DELETE FROM ${table} WHERE ${where}`);
}

/** Remove every test user and anything that involves one (their battles, votes, listings, files…). */
export async function wipeTestData(db: D1Database, bucket: R2Bucket) {
	const TEST = `SELECT id FROM users WHERE is_test = 1`;
	const battles = `creator_id IN (${TEST}) OR challenger_id IN (${TEST})`;
	const keys = await db
		.prepare(
			`SELECT audio_key AS k FROM entries WHERE battle_id IN (SELECT id FROM battles WHERE ${battles}) OR user_id IN (${TEST})
			 UNION SELECT file_key FROM listings WHERE file_key LIKE 'store/%' AND (seller_id IN (${TEST}) OR battle_id IN (SELECT id FROM battles WHERE ${battles}))`
		)
		.all<{ k: string | null }>();
	const counts = await db.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE is_test = 1) AS users, (SELECT COUNT(*) FROM battles WHERE ${battles}) AS battles`).first<{ users: number; battles: number }>();

	const fks = await foreignKeys(db);
	const sql: string[] = [
		// Listens have no foreign keys; clear them by hand.
		`DELETE FROM listens WHERE user_id IN (${TEST}) OR entry_id IN (SELECT id FROM entries WHERE battle_id IN (SELECT id FROM battles WHERE ${battles}))`
	];
	plan('battles', battles, fks, sql);
	plan('users', 'is_test = 1', fks, sql);
	await db.batch(sql.map((s) => db.prepare(s)));

	const files = [...new Set(keys.results.map((r) => r.k).filter((k): k is string => !!k))];
	for (let i = 0; i < files.length; i += 1000) await bucket.delete(files.slice(i, i + 1000));
	return { users: counts?.users ?? 0, battles: counts?.battles ?? 0, files: files.length };
}
