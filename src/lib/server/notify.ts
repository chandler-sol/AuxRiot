import * as cf from 'cloudflare:workers';
import { layout, sendEmail } from './email.ts';
import { getEnv, sha256, DAY } from './util.ts';

/**
 * Battle notification emails. Everything here runs after the response is sent
 * (waitUntil), only goes to confirmed addresses, and respects the
 * "battle emails" setting. Each message has an idempotency key so retries and
 * races never double-send.
 */

const SITE = 'https://auxriot.com';
const REMIND_AFTER = 3 * DAY;
const esc = (s: string) => s.replace(/[<>&"]/g, '');

type Recipient = { id: string; username: string; email: string };

async function recipient(db: D1Database, userId: string): Promise<Recipient | null> {
	return db
		.prepare('SELECT id, username, email FROM users WHERE id = ? AND email_verified_at IS NOT NULL AND notify_battles = 1 AND suspended_at IS NULL')
		.bind(userId)
		.first<Recipient>();
}

export async function unsubscribeToken(userId: string) {
	return (await sha256(`${getEnv().SIGNAL_SALT ?? 'dev-salt'}:unsub:${userId}`)).slice(0, 24);
}
async function unsubscribeUrl(userId: string) {
	return `${SITE}/unsubscribe?u=${encodeURIComponent(userId)}&t=${await unsubscribeToken(userId)}`;
}

/** Run in the background so the request isn't held up by email. */
function later(p: () => Promise<unknown>) {
	const run = p().catch((e) => console.error('[notify]', e));
	// waitUntil keeps the Worker alive after the response; older runtimes lack it.
	const wu = (cf as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
	try {
		wu?.(run);
	} catch {
		/* not in a request (tests): the promise still runs */
	}
}

export function notifyAnswered(db: D1Database, battleId: string) {
	later(async () => {
		const b = await db
			.prepare(
				`SELECT b.title, b.creator_id, b.vote_hours, ch.username AS challenger
				 FROM battles b JOIN users ch ON ch.id = b.challenger_id WHERE b.id = ?`
			)
			.bind(battleId)
			.first<{ title: string; creator_id: string; vote_hours: number; challenger: string }>();
		if (!b) return;
		const to = await recipient(db, b.creator_id);
		if (!to) return;
		const url = `${SITE}/battles/${battleId}`;
		const unsub = await unsubscribeUrl(to.id);
		await sendEmail(getEnv(), {
			to: to.email,
			subject: `${b.challenger} answered your battle 🥊`,
			html: layout({
				kicker: `"${b.title}"`,
				headline: `<span style="color:#ff3d7f">${esc(b.challenger)}</span> stepped up.`,
				body: `Your battle is live. The crowd has ${b.vote_hours} hours to listen and score both beats. Share it — every real listener helps.`,
				button: 'See the battle',
				url,
				footer: 'You get this because you posted this battle on AuxRiot.',
				unsubscribeUrl: unsub
			}),
			text: `${b.challenger} answered your battle "${b.title}". Voting is live for ${b.vote_hours} hours.\n\n${url}\n\nStop battle emails: ${unsub}`,
			idempotencyKey: `answered:${battleId}`,
			unsubscribeUrl: unsub
		});
	});
}

export function notifyResult(db: D1Database, battleId: string) {
	later(async () => {
		const b = await db
			.prepare(
				`SELECT b.title, b.creator_id, b.challenger_id, b.winner_id, c.username AS creator, ch.username AS challenger
				 FROM battles b JOIN users c ON c.id = b.creator_id JOIN users ch ON ch.id = b.challenger_id
				 WHERE b.id = ? AND b.status = 'closed'`
			)
			.bind(battleId)
			.first<{ title: string; creator_id: string; challenger_id: string; winner_id: string | null; creator: string; challenger: string }>();
		if (!b) return;
		const scores = await db
			.prepare('SELECT user_id, score, opponent_score FROM battle_outcomes WHERE battle_id = ?')
			.bind(battleId)
			.all<{ user_id: string; score: number; opponent_score: number }>();
		const url = `${SITE}/battles/${battleId}`;
		for (const uid of [b.creator_id, b.challenger_id]) {
			const to = await recipient(db, uid);
			if (!to) continue;
			const opp = uid === b.creator_id ? b.challenger : b.creator;
			const sc = scores.results.find((s) => s.user_id === uid);
			const card = sc ? `${sc.score.toFixed(2)} to ${sc.opponent_score.toFixed(2)}` : '';
			const earned = await db
				.prepare(`SELECT amount FROM credit_ledger WHERE user_id = ? AND ref = ? AND reason LIKE 'battle_%'`)
				.bind(uid, battleId)
				.first<{ amount: number }>();
			const cr = earned?.amount ? ` +${earned.amount} battle credits.` : '';
			const won = b.winner_id === uid;
			const tie = b.winner_id === null;
			const subject = tie ? `Dead even vs ${opp}` : won ? `You beat ${opp} 🏆` : `Results are in vs ${opp}`;
			const headline = tie
				? `Dead <span style="color:#ff3d7f">even.</span>`
				: won
					? `You <span style="color:#ff3d7f">won.</span>`
					: `Close <span style="color:#ff3d7f">one.</span>`;
			const body = tie
				? `"${b.title}" vs ${opp} finished level${card ? ` — ${card}` : ''}.${cr} Run it back?`
				: won
					? `The crowd picked you over ${opp} on "${b.title}"${card ? ` — ${card}` : ''}.${cr} It's on your record.`
					: `${opp} took "${b.title}"${card ? ` — ${card}` : ''}.${cr} See how the crowd scored each category, then go get it back.`;
			const unsub = await unsubscribeUrl(to.id);
			await sendEmail(getEnv(), {
				to: to.email,
				subject,
				html: layout({ kicker: 'Final scores', headline, body, button: 'See the scorecard', url, footer: 'You get this because you battled on AuxRiot.', unsubscribeUrl: unsub }),
				text: `${body.replace(/<[^>]+>/g, '')}\n\n${url}\n\nStop battle emails: ${unsub}`,
				idempotencyKey: `result:${battleId}:${uid}`,
				unsubscribeUrl: unsub
			});
		}
	});
}

/** Nudge creators whose open battle has waited a few days. Called from the lazy finalizer. */
export async function remindWaiting(db: D1Database, expiryDays: number) {
	const now = Date.now();
	const due = await db
		.prepare(
			`UPDATE battles SET reminded_at = ? WHERE id IN (
			   SELECT id FROM battles WHERE status = 'open' AND reminded_at IS NULL AND created_at < ? LIMIT 10)
			 RETURNING id, title, creator_id, created_at`
		)
		.bind(now, now - REMIND_AFTER)
		.all<{ id: string; title: string; creator_id: string; created_at: number }>();
	if (!due.results.length) return;
	later(async () => {
		for (const b of due.results) {
			const to = await recipient(db, b.creator_id);
			if (!to) continue;
			const daysLeft = Math.max(1, Math.round((b.created_at + expiryDays * DAY - now) / DAY));
			const url = `${SITE}/c/${b.id}`;
			const unsub = await unsubscribeUrl(to.id);
			await sendEmail(getEnv(), {
				to: to.email,
				subject: `"${b.title}" is still waiting for a challenger`,
				html: layout({
					kicker: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
					headline: `Call someone <span style="color:#ff3d7f">out.</span>`,
					body: `Nobody's answered "${b.title}" yet. Send your challenge link to a producer you want smoke with — they can hear 30 seconds and sign up to answer in one go.`,
					button: 'Get my challenge link',
					url,
					footer: 'You get this because you posted this battle on AuxRiot.',
					unsubscribeUrl: unsub
				}),
				text: `Nobody's answered "${b.title}" yet. Share your challenge link: ${url}\n\nStop battle emails: ${unsub}`,
				idempotencyKey: `remind:${b.id}`,
				unsubscribeUrl: unsub
			});
		}
	});
}

/** The set was too close (or judges called for more): invite both battlers to run it back. */
export function notifyOvertime(db: D1Database, battleId: string) {
	later(async () => {
		const b = await db
			.prepare(
				`SELECT b.title, b.creator_id, b.challenger_id, b.ot_mode, c.username AS creator, ch.username AS challenger
				 FROM battles b JOIN users c ON c.id = b.creator_id JOIN users ch ON ch.id = b.challenger_id WHERE b.id = ?`
			)
			.bind(battleId)
			.first<{ title: string; creator_id: string; challenger_id: string; ot_mode: string; creator: string; challenger: string }>();
		if (!b) return;
		const url = `${SITE}/battles/${battleId}#overtime`;
		for (const uid of [b.creator_id, b.challenger_id]) {
			const to = await recipient(db, uid);
			if (!to) continue;
			const opp = uid === b.creator_id ? b.challenger : b.creator;
			const why = b.ot_mode === 'forced' ? 'The judges want one more round.' : 'The set finished too close to call.';
			const unsub = await unsubscribeUrl(to.id);
			await sendEmail(getEnv(), {
				to: to.email,
				subject: `Overtime? "${b.title}" vs ${opp}`,
				html: layout({
					kicker: 'Too close to call',
					headline: `Run it <span style="color:#ff3d7f">back?</span>`,
					body: `${why} Drop one more beat within 24 hours to go to overtime — ${opp} can't hear it until you've both submitted.${b.ot_mode === 'forced' ? ' If only one of you submits, that producer takes the battle.' : ' If you both don’t submit, it stays a tie.'}`,
					button: 'Drop your overtime beat',
					url,
					footer: 'You get this because you battled on AuxRiot.',
					unsubscribeUrl: unsub
				}),
				text: `${why} Drop one more beat within 24 hours: ${url}\n\nStop battle emails: ${unsub}`,
				idempotencyKey: `ot:${battleId}:${uid}`,
				unsubscribeUrl: unsub
			});
		}
	});
}

const BALLOT_REMIND_WINDOW = 60 * 60_000;

/**
 * Judges who saved some rounds of a multi-beat ballot but not all of them get one
 * nudge when under an hour of voting is left. Run from the cron every 15 minutes.
 */
export async function remindUnfinishedBallots(db: D1Database) {
	const now = Date.now();
	const due = await db
		.prepare(
			`INSERT OR IGNORE INTO judge_reminders (battle_id, voter_id, sent_at)
			 SELECT b.id, rv.voter_id, ?
			 FROM battles b JOIN round_votes rv ON rv.battle_id = b.id AND rv.round <= b.rounds
			 WHERE b.status = 'voting' AND b.rounds > 1 AND b.voting_ends_at > ? AND b.voting_ends_at <= ?
			   AND rv.voter_id NOT IN (b.creator_id, b.challenger_id)
			 GROUP BY b.id, rv.voter_id
			 HAVING COUNT(*) < b.rounds
			 LIMIT 200
			 RETURNING battle_id, voter_id`
		)
		.bind(now, now, now + BALLOT_REMIND_WINDOW)
		.all<{ battle_id: string; voter_id: string }>();
	for (const r of due.results) {
		const b = await db
			.prepare(
				`SELECT b.title, b.rounds, b.voting_ends_at,
				        (SELECT COUNT(*) FROM round_votes WHERE battle_id = b.id AND voter_id = ? AND round <= b.rounds) AS scored
				 FROM battles b WHERE b.id = ?`
			)
			.bind(r.voter_id, r.battle_id)
			.first<{ title: string; rounds: number; voting_ends_at: number; scored: number }>();
		const to = await recipient(db, r.voter_id);
		if (!b || !to) continue;
		const mins = Math.max(1, Math.round((b.voting_ends_at - now) / 60_000));
		const left = b.rounds - b.scored;
		const url = `${SITE}/battles/${r.battle_id}`;
		const unsub = await unsubscribeUrl(to.id);
		await sendEmail(getEnv(), {
			to: to.email,
			subject: `Finish your ballot — "${b.title}" closes in ${mins} min`,
			html: layout({
				kicker: `${b.scored} of ${b.rounds} rounds scored`,
				headline: `Finish your <span style="color:#ff3d7f">ballot.</span>`,
				body: `You started judging "${esc(b.title)}" but ${left === 1 ? 'one round is' : `${left} rounds are`} still unscored. Your saved rounds are waiting — the ballot only counts once every round is scored, and voting closes in about ${mins} minutes. Judging pays credits per round.`,
				button: 'Finish judging',
				url,
				footer: 'You get this because you started judging this battle on AuxRiot.',
				unsubscribeUrl: unsub
			}),
			text: `You're ${b.scored} of ${b.rounds} rounds into judging "${b.title}". It only counts once every round is scored, and voting closes in about ${mins} minutes.\n\n${url}\n\nStop battle emails: ${unsub}`,
			idempotencyKey: `ballot:${r.battle_id}:${r.voter_id}`,
			unsubscribeUrl: unsub
		});
	}
	return due.results.length;
}
