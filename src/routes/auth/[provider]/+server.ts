import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { authorizeUrl, callbackUrl, enabledProviders, isProvider } from '#lib/server/oauth.ts';

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/battles');

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const env = getEnv();
	const provider = params.provider;
	if (!isProvider(provider) || !enabledProviders(env).includes(provider)) error(404);
	const a = await authorizeUrl(env, provider, callbackUrl(url, provider));
	const opts = { path: '/auth', httpOnly: true, sameSite: 'lax' as const, secure: url.protocol === 'https:', maxAge: 600 };
	cookies.set('oauth_state', `${provider}:${a.state}:${a.verifier}`, opts);
	cookies.set('oauth_next', safeNext(url.searchParams.get('next')), opts);
	redirect(302, a.url, { external: true });
};
