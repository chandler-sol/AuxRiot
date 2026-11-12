import { newId, sha256 } from './util.ts';

/**
 * "Continue with Google / Discord". Plain OAuth 2 authorization-code flow with
 * a state cookie (CSRF) and PKCE. A provider is enabled once its client id and
 * secret are set as Worker secrets.
 */
export type Provider = 'google' | 'discord';
export const PROVIDERS: Provider[] = ['google', 'discord'];

export interface OAuthProfile {
	id: string;
	email: string | null;
	emailVerified: boolean;
	suggested: string;
	avatarUrl: string | null;
}

const CONF = {
	google: {
		authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
		token: 'https://oauth2.googleapis.com/token',
		scope: 'openid email profile',
		id: (env: Env) => env.GOOGLE_CLIENT_ID,
		secret: (env: Env) => env.GOOGLE_CLIENT_SECRET
	},
	discord: {
		authorize: 'https://discord.com/oauth2/authorize',
		token: 'https://discord.com/api/oauth2/token',
		scope: 'identify email',
		id: (env: Env) => env.DISCORD_CLIENT_ID,
		secret: (env: Env) => env.DISCORD_CLIENT_SECRET
	}
} as const;

export function enabledProviders(env: Env): Provider[] {
	return PROVIDERS.filter((p) => CONF[p].id(env) && CONF[p].secret(env));
}

export function isProvider(p: string): p is Provider {
	return (PROVIDERS as string[]).includes(p);
}

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function authorizeUrl(env: Env, provider: Provider, redirectUri: string) {
	const c = CONF[provider];
	const state = newId(24);
	const verifier = newId(48);
	const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
	const u = new URL(c.authorize);
	u.searchParams.set('client_id', c.id(env)!);
	u.searchParams.set('redirect_uri', redirectUri);
	u.searchParams.set('response_type', 'code');
	u.searchParams.set('scope', c.scope);
	u.searchParams.set('state', state);
	u.searchParams.set('code_challenge', challenge);
	u.searchParams.set('code_challenge_method', 'S256');
	if (provider === 'google') u.searchParams.set('prompt', 'select_account');
	if (provider === 'discord') u.searchParams.set('prompt', 'none');
	return { url: u.toString(), state, verifier };
}

/** Exchange the code and fetch the person's profile. */
export async function fetchProfile(env: Env, provider: Provider, code: string, verifier: string, redirectUri: string): Promise<OAuthProfile | null> {
	const c = CONF[provider];
	const body = new URLSearchParams({
		client_id: c.id(env)!,
		client_secret: c.secret(env)!,
		grant_type: 'authorization_code',
		code,
		redirect_uri: redirectUri,
		code_verifier: verifier
	});
	const tr = await fetch(c.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
	if (!tr.ok) {
		console.error('[oauth] token exchange failed', provider, tr.status, await tr.text());
		return null;
	}
	const { access_token } = (await tr.json()) as { access_token?: string };
	if (!access_token) return null;
	const auth = { Authorization: `Bearer ${access_token}`, 'User-Agent': 'AuxRiot (auxriot.com)' };

	if (provider === 'google') {
		const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: auth });
		if (!r.ok) return null;
		const p = (await r.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; given_name?: string; picture?: string };
		return { id: p.sub, email: p.email?.toLowerCase() ?? null, emailVerified: !!p.email_verified, suggested: p.given_name || p.name || p.email?.split('@')[0] || '', avatarUrl: p.picture ?? null };
	}
	const r = await fetch('https://discord.com/api/users/@me', { headers: auth });
	if (!r.ok) return null;
	const p = (await r.json()) as { id: string; username: string; global_name?: string | null; email?: string | null; verified?: boolean; avatar?: string | null };
	return {
		id: p.id,
		email: p.email?.toLowerCase() ?? null,
		emailVerified: !!p.verified && !!p.email,
		suggested: p.username || p.global_name || '',
		avatarUrl: p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=256` : null
	};
}

/** Turn a display name into a valid, available-looking username suggestion. */
export function cleanUsername(s: string) {
	let u = s.normalize('NFKD').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
	if (u.length < 3) u = (u + 'producer').slice(0, 12);
	return u;
}

export async function hashToken(t: string) {
	return sha256('oauth-pending:' + t);
}

/** Must match the redirect URI registered with each provider exactly. */
export function callbackUrl(url: URL, provider: Provider) {
	const origin = url.hostname === 'auxriot.com' ? 'https://auxriot.com' : url.origin;
	return `${origin}/auth/${provider}/callback`;
}
