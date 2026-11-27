/**
 * Minimal Stripe client for Workers: plain fetch, no SDK.
 * - v1 endpoints take form-encoded params (nested objects flattened as a[b][c]).
 * - v2 endpoints (Accounts v2, account links) take JSON and a dated preview version.
 * Keys live only in Worker secrets; nothing here is ever sent to the browser.
 */
const API = 'https://api.stripe.com';
/** Placeholder key the CI robot uses (see .github/workflows/deploy.yml). Never a real key. */
const ROBOT_KEY = 'sk_test_robot_not_real';
export const STRIPE_V2_VERSION = '2026-10-28.preview';

export class StripeError extends Error {
	constructor(message: string, public status: number, public code?: string, public type?: string) {
		super(message);
	}
}

export function stripeMode(env: Env): 'test' | 'live' | null {
	const k = env.STRIPE_SECRET_KEY ?? '';
	return k.startsWith('sk_live_') || k.startsWith('rk_live_') ? 'live' : k.startsWith('sk_test_') || k.startsWith('rk_test_') ? 'test' : null;
}

/** Checkout needs both Stripe secrets on this Worker. */
export const checkoutLive = (env: Env) => !!stripeMode(env) && !!env.STRIPE_WEBHOOK_SECRET;

function key(env: Env) {
	if (!env.STRIPE_SECRET_KEY) throw new StripeError('Stripe is not configured yet.', 503, 'not_configured');
	return env.STRIPE_SECRET_KEY;
}

type Params = Record<string, unknown>;
function encode(params: Params, prefix = '', out = new URLSearchParams()) {
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null) continue;
		const name = prefix ? `${prefix}[${k}]` : k;
		if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encode(item as Params, `${name}[${i}]`, out) : out.append(`${name}[]`, String(item))));
		else if (typeof v === 'object') encode(v as Params, name, out);
		else out.append(name, String(v));
	}
	return out;
}

async function parse<T>(res: Response): Promise<T> {
	const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string; type?: string } };
	if (!res.ok) throw new StripeError(body.error?.message ?? `Stripe request failed (${res.status})`, res.status, body.error?.code, body.error?.type);
	return body as T;
}

/** v1 call. `account` acts on a connected account (Stripe-Account header). */
export async function stripeV1<T = Record<string, unknown>>(
	env: Env,
	method: 'GET' | 'POST' | 'DELETE',
	path: string,
	params: Params = {},
	opts: { account?: string; idempotencyKey?: string } = {}
): Promise<T> {
	const k = key(env);
	// The test robot runs with this placeholder key and never reaches Stripe. Money movements
	// (refunds, reversals, transfers) answer like Stripe would, so refund paths can be tested
	// end to end; anything else fails the way a bad key does.
	if (k === ROBOT_KEY) {
		if (/^\/v1\/(refunds|transfers|application_fees|payment_intents)/.test(path)) return { id: `robot_${Date.now()}`, object: 'robot' } as T;
		throw new StripeError('Invalid API Key provided (test robot).', 401, 'api_key_invalid');
	}
	const headers: Record<string, string> = { Authorization: `Bearer ${k}` };
	if (opts.account) headers['Stripe-Account'] = opts.account;
	if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
	const qs = encode(params).toString();
	const res =
		method === 'GET'
			? await fetch(`${API}${path}${qs ? `?${qs}` : ''}`, { headers })
			: await fetch(`${API}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs });
	return parse<T>(res);
}

/** v2 call (JSON body, preview API version). */
export async function stripeV2<T = Record<string, unknown>>(env: Env, method: 'GET' | 'POST', path: string, body?: Params, query?: Record<string, string | string[]>) {
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(query ?? {})) (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, x));
	const res = await fetch(`${API}${path}${qs.size ? `?${qs}` : ''}`, {
		method,
		headers: { Authorization: `Bearer ${key(env)}`, 'Stripe-Version': STRIPE_V2_VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	return parse<T>(res);
}

// ---------------------------------------------------------------------------
// Webhook signatures (Stripe-Signature: t=…,v1=…), HMAC-SHA256 over "t.payload".

const TOLERANCE_S = 300;

export async function verifyWebhook(secret: string, payload: string, header: string | null): Promise<boolean> {
	if (!header) return false;
	const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
	const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
	const t = Number(parts.t);
	if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
	const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${payload}`)));
	const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
	// Constant-time compare against each candidate.
	return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}
