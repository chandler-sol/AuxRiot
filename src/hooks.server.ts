import type { Handle } from '@sveltejs/kit/hooks';
import { DEVICE_COOKIE, SESSION_COOKIE, getSessionUser } from '#lib/server/auth.ts';
import { getEnv, newId } from '#lib/server/util.ts';

export const handle: Handle = async ({ event, resolve }) => {
	// One canonical host: www.auxriot.com → auxriot.com
	if (event.url.hostname.startsWith('www.')) {
		const target = new URL(event.url);
		target.hostname = target.hostname.slice(4);
		return Response.redirect(target.toString(), 301);
	}

	const env = getEnv();
	event.locals.user = null;
	event.locals.ip = event.request.headers.get('cf-connecting-ip') ?? '';

	// Long-lived random device cookie: one of the multi-account signals.
	let deviceId = event.cookies.get(DEVICE_COOKIE);
	if (!deviceId) {
		deviceId = newId(16);
		event.cookies.set(DEVICE_COOKIE, deviceId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: event.url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 365 * 2
		});
	}
	event.locals.deviceId = deviceId;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const admins = (env.ADMIN_USERNAMES || '')
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean);
		event.locals.user = await getSessionUser(env.DB, token, admins);
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	return response;
};
