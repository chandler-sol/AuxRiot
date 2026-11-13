import { newId, getEnv, HOUR, DAY } from './util.ts';
import { layout, sendEmail } from './email.ts';
import { unsubscribeToken } from './notify.ts';

/**
 * Private buyer <-> producer threads, one per buyer per listing. No real-time
 * layer: messages are plain rows, the inbox polls on navigation, and the
 * recipient gets at most one email per thread every 30 minutes while unread.
 */

export const MAX_MESSAGE = 2000;
const NEW_THREADS_PER_DAY = 10;
const MESSAGES_PER_HOUR = 60;
const EMAIL_GAP = 30 * 60_000;

export type Conversation = {
	id: string; listing_id: string | null; order_id: string | null; buyer_id: string; seller_id: string;
	buyer_read_at: number; seller_read_at: number; buyer_emailed_at: number; seller_emailed_at: number; last_message_at: number; created_at: number;
};

/** Phone numbers, email addresses and payment apps: deals there aren't protected. Flagged, never blocked. */
export function looksOffPlatform(text: string) {
	const t = text.toLowerCase();
	if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return true;
	if (/(\+?\d[\s().-]*){10,}/.test(text)) return true;
	if (/(^|\s)\$[a-z][a-z0-9_]{2,}/i.test(text)) return true; // $cashtag
	return /\b(cash ?app|venmo|paypal|zelle|apple ?pay|google ?pay|wire (me|it)|crypto|bitcoin|usdt|whats ?app|telegram|wa\.me|t\.me)\b/.test(t);
}

export async function isBlocked(db: D1Database, a: string, b: string) {
	const r = await db
		.prepare('SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1')
		.bind(a, b, b, a)
		.first();
	return !!r;
}

export async function getConversation(db: D1Database, id: string, userId: string) {
	return db.prepare('SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)').bind(id, userId, userId).first<Conversation>();
}

/** Find or open the thread between this buyer and the listing's producer. Returns an error string or the conversation. */
export async function openConversation(db: D1Database, listingId: string, buyer: SessionUser): Promise<Conversation | string> {
	const l = await db.prepare(`SELECT id, seller_id, status FROM listings WHERE id = ?`).bind(listingId).first<{ id: string; seller_id: string; status: string }>();
	if (!l || l.status === 'removed') return 'That beat is no longer available.';
	if (l.seller_id === buyer.id) return "That's your own beat.";
	const existing = await db.prepare('SELECT * FROM conversations WHERE listing_id = ? AND buyer_id = ?').bind(l.id, buyer.id).first<Conversation>();
	if (existing) return existing;
	if (!buyer.emailVerified) return 'Confirm your email to message producers.';
	if (await isBlocked(db, buyer.id, l.seller_id)) return "You can't message this producer.";
	const recent = await db
		.prepare('SELECT COUNT(*) AS n FROM conversations WHERE buyer_id = ? AND created_at > ?')
		.bind(buyer.id, Date.now() - DAY)
		.first<{ n: number }>();
	if ((recent?.n ?? 0) >= NEW_THREADS_PER_DAY) return "You've started a lot of conversations today. Try again tomorrow.";
	const now = Date.now();
	await db
		.prepare(
			`INSERT OR IGNORE INTO conversations (id, listing_id, buyer_id, seller_id, last_message_at, created_at, buyer_read_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(newId(), l.id, buyer.id, l.seller_id, now, now, now)
		.run();
	return (await db.prepare('SELECT * FROM conversations WHERE listing_id = ? AND buyer_id = ?').bind(l.id, buyer.id).first<Conversation>())!;
}

export async function sendMessage(db: D1Database, c: Conversation, sender: SessionUser, raw: string): Promise<{ id: string; offPlatform: boolean } | string> {
	const body = raw.trim();
	if (!body) return 'Write a message first.';
	if (body.length > MAX_MESSAGE) return `Keep it under ${MAX_MESSAGE} characters.`;
	const other = sender.id === c.buyer_id ? c.seller_id : c.buyer_id;
	if (await isBlocked(db, sender.id, other)) return "You can't message this person.";
	const recent = await db
		.prepare('SELECT COUNT(*) AS n, MAX(created_at) AS last FROM messages WHERE sender_id = ? AND created_at > ?')
		.bind(sender.id, Date.now() - HOUR)
		.first<{ n: number; last: number | null }>();
	if ((recent?.n ?? 0) >= MESSAGES_PER_HOUR) return 'Slow down — try again in a bit.';
	if (recent?.last && Date.now() - recent.last < 2000) return 'Slow down a little.';

	const id = newId();
	const now = Date.now();
	const offPlatform = looksOffPlatform(body);
	const readCol = sender.id === c.buyer_id ? 'buyer_read_at' : 'seller_read_at';
	await db.batch([
		db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, off_platform, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, c.id, sender.id, body, offPlatform ? 1 : 0, now),
		db.prepare(`UPDATE conversations SET last_message_at = ?, ${readCol} = ? WHERE id = ?`).bind(now, now, c.id)
	]);
	// Shadowbanned senders: the message is stored and looks sent, but the other person never sees it or gets an email.
	if (!sender.shadowbanned) await maybeEmail(db, c, sender, other, body);
	return { id, offPlatform };
}

async function maybeEmail(db: D1Database, c: Conversation, sender: SessionUser, recipientId: string, body: string) {
	const side = recipientId === c.buyer_id ? 'buyer' : 'seller';
	const fresh = (await db.prepare('SELECT * FROM conversations WHERE id = ?').bind(c.id).first<Conversation>())!;
	const readAt = side === 'buyer' ? fresh.buyer_read_at : fresh.seller_read_at;
	const emailedAt = side === 'buyer' ? fresh.buyer_emailed_at : fresh.seller_emailed_at;
	// One nudge per thread while it's unread, at most every 30 minutes.
	if (emailedAt > readAt && Date.now() - emailedAt < EMAIL_GAP) return;
	const to = await db
		.prepare('SELECT id, email FROM users WHERE id = ? AND email_verified_at IS NOT NULL AND notify_messages = 1 AND suspended_at IS NULL')
		.bind(recipientId)
		.first<{ id: string; email: string }>();
	if (!to) return;
	const title = c.listing_id
		? (await db.prepare('SELECT b.title FROM listings l JOIN battles b ON b.id = l.battle_id WHERE l.id = ?').bind(c.listing_id).first<{ title: string }>())?.title
		: null;
	await db.prepare(`UPDATE conversations SET ${side}_emailed_at = ? WHERE id = ?`).bind(Date.now(), c.id).run();
	const url = `https://auxriot.com/messages/${c.id}`;
	const unsub = `https://auxriot.com/unsubscribe?u=${encodeURIComponent(to.id)}&t=${await unsubscribeToken(to.id)}&kind=messages`;
	const preview = body.length > 180 ? body.slice(0, 180) + '…' : body;
	await sendEmail(getEnv(), {
		to: to.email,
		subject: `@${sender.username} sent you a message${title ? ` about "${title}"` : ''}`,
		html: layout({
			kicker: title ? `About "${title}"` : 'New message',
			headline: `<span style="color:#ff3d7f">@${sender.username.replace(/[<>&"]/g, '')}</span> wrote.`,
			body: preview,
			button: 'Reply on AuxRiot',
			url,
			footer: 'Keep deals on AuxRiot — paying elsewhere for a listed beat isn\'t allowed or protected.',
			unsubscribeUrl: unsub
		}),
		text: `@${sender.username} wrote${title ? ` about "${title}"` : ''}:\n\n${preview}\n\nReply: ${url}\n\nStop message emails: ${unsub}`,
		idempotencyKey: `msg:${c.id}:${Math.floor(Date.now() / EMAIL_GAP)}`,
		unsubscribeUrl: unsub
	});
}

/** Threads with messages the user hasn't seen (hidden, shadowbanned and blocked senders don't count). */
export async function unreadThreads(db: D1Database, userId: string) {
	const r = await db
		.prepare(
			`SELECT COUNT(DISTINCT c.id) AS n FROM conversations c
			 JOIN messages m ON m.conversation_id = c.id
			 JOIN users s ON s.id = m.sender_id
			 WHERE (c.buyer_id = ?1 OR c.seller_id = ?1) AND m.sender_id != ?1 AND m.hidden = 0 AND s.shadowbanned = 0
			   AND m.created_at > CASE WHEN c.buyer_id = ?1 THEN c.buyer_read_at ELSE c.seller_read_at END
			   AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = ?1 AND b.blocked_id = m.sender_id)`
		)
		.bind(userId)
		.first<{ n: number }>();
	return r?.n ?? 0;
}
