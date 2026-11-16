import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { expressDashboardLink, onboardingLink, payoutStatus, setMondayPayouts } from '#lib/server/payouts.ts';
import { stripeMode } from '#lib/server/stripe.ts';

/** Raw Stripe errors go to admins (and the log); everyone else gets a plain message. */
function friendly(e: unknown, isAdmin: boolean) {
	const msg = e instanceof Error ? e.message : String(e);
	console.error('[payouts]', msg);
	return isAdmin ? `Stripe said: ${msg}` : "We couldn't open Stripe just now. Try again in a minute — if it keeps happening, email hello@auxriot.com.";
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const env = getEnv();
	// Expired or reused onboarding link: make a fresh one and go straight back.
	if (url.searchParams.get('refresh') && stripeMode(env)) {
		const link = await onboardingLink(env, locals.user.id, url.origin).catch((e) => (friendly(e, false), null));
		if (link) redirect(303, link, { external: true });
	}
	const status = stripeMode(env) ? await payoutStatus(env, locals.user.id) : { state: 'unavailable' as const, due: 0, accountId: null, error: 'not_configured' };
	// Back from onboarding: make sure the Monday schedule is set now that the account exists.
	if (url.searchParams.get('return') && status.accountId && status.state === 'active') await setMondayPayouts(env, status.accountId).catch(() => {});
	return { status, returned: !!url.searchParams.get('return'), mode: stripeMode(env) };
};

export const actions: Actions = {
	start: async ({ locals, url }) => {
		if (!locals.user) return fail(401, { error: 'Log in first.' });
		let link: string;
		try {
			link = await onboardingLink(getEnv(), locals.user.id, url.origin);
		} catch (e) {
			return fail(502, { error: friendly(e, locals.user.isAdmin) });
		}
		redirect(303, link, { external: true });
	},
	dashboard: async ({ locals }) => {
		if (!locals.user) return fail(401, { error: 'Log in first.' });
		const env = getEnv();
		const s = await payoutStatus(env, locals.user.id);
		if (!s.accountId) return fail(400, { error: 'Set up payouts first.' });
		let link: string;
		try {
			link = await expressDashboardLink(env, s.accountId);
		} catch (e) {
			return fail(502, { error: friendly(e, locals.user.isAdmin) });
		}
		redirect(303, link, { external: true });
	}
};
