import type { Actions, PageServerLoad } from './$types';
import { consentRequired, countryOf, VIEW_CONSENT_COOKIE } from '#lib/server/consent.ts';

/** Cookie choices (Privacy §5): view counting can be allowed, declined or withdrawn here. */
export const load: PageServerLoad = async ({ cookies, request }) => ({
	choice: cookies.get(VIEW_CONSENT_COOKIE) ?? null,
	required: consentRequired(countryOf(request))
});

const set = (cookies: import('@sveltejs/kit').Cookies, v: 'yes' | 'no', secure: boolean) =>
	cookies.set(VIEW_CONSENT_COOKIE, v, { path: '/', httpOnly: false, sameSite: 'lax', secure, maxAge: 365 * 86_400 });

export const actions: Actions = {
	allow: async ({ cookies, url }) => {
		set(cookies, 'yes', url.protocol === 'https:');
		return { ok: 'View counting allowed. You can change this any time here.' };
	},
	decline: async ({ cookies, url }) => {
		set(cookies, 'no', url.protocol === 'https:');
		return { ok: 'View counting is off for you. Security features keep working.' };
	}
};
