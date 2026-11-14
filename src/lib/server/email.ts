import { Resend } from 'resend';
import { newId, sha256, HOUR } from './util.ts';

export const FROM = 'AuxRiot <admin@mail.auxriot.com>';
const VERIFY_TTL = 48 * HOUR;
const RESET_TTL = 1 * HOUR;
/** Minimum gap between emails of the same kind to the same account. */
const RESEND_COOLDOWN = 60_000;

interface Message {
	to: string;
	subject: string;
	html: string;
	text: string;
	/** Same key within 24h = Resend sends once, even if we retry or the user double-clicks. */
	idempotencyKey: string;
	/** One-click unsubscribe link (adds List-Unsubscribe headers). */
	unsubscribeUrl?: string;
}

/**
 * Send one email through Resend. Retries with backoff on rate limits (429)
 * and server errors (5xx). Without an API key (local dev) the email is
 * printed to the console instead, so links can still be clicked.
 */
export async function sendEmail(env: Env, msg: Message): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	if (env.ENVIRONMENT === 'beta') {
		// Beta emails should send people back to beta, not the live site.
		const toBeta = (x: string) => x.replaceAll('https://auxriot.com', 'https://beta.auxriot.com');
		msg = { ...msg, subject: `[BETA] ${msg.subject}`, html: toBeta(msg.html), text: msg.text && toBeta(msg.text), unsubscribeUrl: msg.unsubscribeUrl && toBeta(msg.unsubscribeUrl) };
	}
	if (!env.RESEND_API_KEY) {
		console.log(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
		return { ok: true, id: 'dev' };
	}
	const resend = new Resend(env.RESEND_API_KEY);
	let lastError = 'unknown error';
	for (let attempt = 0; attempt < 3; attempt++) {
		const { data, error } = await resend.emails.send(
			{
				from: FROM,
				to: msg.to,
				subject: msg.subject,
				html: msg.html,
				text: msg.text,
				headers: msg.unsubscribeUrl
					? { 'List-Unsubscribe': `<${msg.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
					: undefined
			},
			{ idempotencyKey: msg.idempotencyKey }
		);
		if (data) return { ok: true, id: data.id };
		lastError = error?.message ?? lastError;
		const status = error?.statusCode ?? 0;
		if (status !== 429 && status < 500) break; // bad request etc. won't fix itself
		await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
	}
	console.error('[email] send failed:', lastError);
	return { ok: false, error: lastError };
}

/** Create a single-use emailed link token; returns the raw token (only its hash is stored). */
export async function createEmailToken(
	db: D1Database,
	userId: string,
	purpose: 'verify' | 'reset'
): Promise<{ token: string } | { error: 'cooldown' }> {
	const now = Date.now();
	const last = await db
		.prepare('SELECT created_at FROM email_tokens WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1')
		.bind(userId, purpose)
		.first<{ created_at: number }>();
	if (last && now - last.created_at < RESEND_COOLDOWN) return { error: 'cooldown' };

	const token = newId(24);
	await db.batch([
		// Older unused links of the same kind stop working once a new one is sent.
		db.prepare('UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL').bind(now, userId, purpose),
		db
			.prepare('INSERT INTO email_tokens (token_hash, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
			.bind(await sha256(token), userId, purpose, now, now + (purpose === 'verify' ? VERIFY_TTL : RESET_TTL))
	]);
	return { token };
}

/** Look up a token without using it up (for showing the reset form). */
export async function peekEmailToken(db: D1Database, token: string, purpose: 'verify' | 'reset') {
	return db
		.prepare('SELECT user_id FROM email_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?')
		.bind(await sha256(token), purpose, Date.now())
		.first<{ user_id: string }>();
}

/** Atomically mark a token used; returns its user id if it was valid. */
export async function consumeEmailToken(db: D1Database, token: string, purpose: 'verify' | 'reset') {
	const hash = await sha256(token);
	const now = Date.now();
	const row = await db
		.prepare(
			`UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?
			 RETURNING user_id`
		)
		.bind(now, hash, purpose, now)
		.first<{ user_id: string }>();
	return row?.user_id ?? null;
}

// ---------------------------------------------------------------------------
// Templates (flyer style; inline CSS because email clients ignore stylesheets)

export function layout(opts: { kicker: string; headline: string; body: string; button: string; url: string; footer: string; unsubscribeUrl?: string }) {
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	return `<!doctype html><html><head><meta charset="utf-8"><style>@import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');</style></head><body style="margin:0;background:#0e0d0b;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#ede6d6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="font-family:Anton,Impact,'Arial Narrow Bold','Arial Black',sans-serif;font-size:30px;letter-spacing:1px;color:#ede6d6;padding-bottom:28px">AUX<span style="color:#ff3d7f">RIOT</span></td></tr>
<tr><td style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a8274;padding-bottom:10px">${esc(opts.kicker)}</td></tr>
<tr><td style="font-family:Anton,Impact,'Arial Narrow Bold','Arial Black',sans-serif;font-size:44px;line-height:1;text-transform:uppercase;color:#ede6d6;padding-bottom:18px">${opts.headline}</td></tr>
<tr><td style="font-size:16px;line-height:1.5;color:#bdb5a3;padding-bottom:26px">${esc(opts.body)}</td></tr>
<tr><td style="padding-bottom:26px"><a href="${esc(opts.url)}" style="display:inline-block;background:#ede6d6;color:#0e0d0b;text-decoration:none;font-family:Anton,Impact,'Arial Narrow Bold','Arial Black',sans-serif;font-size:20px;letter-spacing:1px;text-transform:uppercase;padding:14px 26px;border-radius:2px">${esc(opts.button)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#8a8274;border-top:1px dashed #3a352e;padding-top:16px">${esc(opts.footer)}<br>Button not working? Paste this link into your browser:<br><a href="${esc(opts.url)}" style="color:#ede6d6;word-break:break-all">${esc(opts.url)}</a>${opts.unsubscribeUrl ? `<br><br><a href="${esc(opts.unsubscribeUrl)}" style="color:#8a8274">Stop battle emails</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

export function verifyEmail(username: string, url: string, token: string): Omit<Message, 'to'> {
	return {
		subject: 'Confirm your email for AuxRiot',
		html: layout({
			kicker: 'One more step',
			headline: `You're in, <span style="color:#ff3d7f">${username.replace(/[<>&"]/g, '')}</span>.`,
			body: 'Confirm this is your email to unlock voting. It keeps battles fair — every vote comes from a real inbox.',
			button: 'Confirm my email',
			url,
			footer: "This link works for 48 hours. Didn't sign up for AuxRiot? Ignore this email."
		}),
		text: `You're in, ${username}.\n\nConfirm your email to unlock voting on AuxRiot:\n${url}\n\nThis link works for 48 hours. Didn't sign up? Ignore this email.`,
		idempotencyKey: `verify:${token.slice(0, 16)}`
	};
}

export function resetEmail(username: string, url: string, token: string): Omit<Message, 'to'> {
	return {
		subject: 'Reset your AuxRiot password',
		html: layout({
			kicker: 'Password reset',
			headline: `Locked out, <span style="color:#ff3d7f">${username.replace(/[<>&"]/g, '')}</span>?`,
			body: 'Someone (hopefully you) asked to reset your password. Tap below to pick a new one.',
			button: 'Choose a new password',
			url,
			footer: "This link works for 1 hour and only once. Didn't ask for this? Ignore it — your password stays the same."
		}),
		text: `Reset your AuxRiot password, ${username}:\n${url}\n\nThis link works for 1 hour and only once. Didn't ask for this? Ignore it.`,
		idempotencyKey: `reset:${token.slice(0, 16)}`
	};
}

