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
