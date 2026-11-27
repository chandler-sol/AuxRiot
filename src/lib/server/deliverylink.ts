import { b64url } from './util.ts';

/**
 * Store Terms §6: delivery links expire after seven days. Used when a verified buyer can't
 * sign in (e.g. a suspended account): admin emails them signed links to their purchased files.
 */
export const LINK_DAYS = 7;

async function key(env: Env) {
	return crypto.subtle.importKey('raw', new TextEncoder().encode(`${env.SIGNAL_SALT ?? 'dev-salt'}:delivery`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const payload = (orderId: string, kind: string, exp: number) => new TextEncoder().encode(`${orderId}|${kind}|${exp}`);

export async function signDelivery(env: Env, orderId: string, kind: 'file' | 'stems', origin: string) {
	const exp = Date.now() + LINK_DAYS * 86_400_000;
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(env), payload(orderId, kind, exp)));
	return { url: `${origin}/purchases/${orderId}/download/${kind}?e=${exp}&t=${b64url(sig)}`, exp };
}

export async function verifyDelivery(env: Env, orderId: string, kind: string, exp: string | null, token: string | null) {
	const e = Number(exp);
	if (!token || !Number.isFinite(e) || e < Date.now()) return false;
	const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await key(env), payload(orderId, kind, e)));
	const got = b64url(expected);
	if (got.length !== token.length) return false;
	let diff = 0;
	for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ token.charCodeAt(i);
	return diff === 0;
}
