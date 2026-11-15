import { StripeError, stripeV1, stripeV2 } from './stripe.ts';

/**
 * Seller payouts through Stripe Connect (Accounts v2, marketplace setup):
 * each seller gets a recipient account with the Express dashboard; AuxRiot
 * collects fees and covers losses. Sellers are paid weekly on Mondays.
 */

export type PayoutState = 'none' | 'pending' | 'active' | 'restricted' | 'unavailable';
export type PayoutStatus = { state: PayoutState; due: number; accountId: string | null; error?: string };

type V2Account = {
	id: string;
	configuration?: { recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } } } };
	requirements?: { entries?: { minimum_deadline?: { status?: string } }[] };
};

const INCLUDE = ['configuration.recipient', 'requirements'];

function toStatus(a: V2Account): PayoutStatus {
	const cap = a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
	const due = (a.requirements?.entries ?? []).filter((e) => ['currently_due', 'past_due'].includes(e.minimum_deadline?.status ?? '')).length;
	const state: PayoutState = cap === 'active' ? 'active' : cap === 'restricted' || cap === 'unsupported' ? 'restricted' : 'pending';
	return { state, due, accountId: a.id };
}

/** Live status from Stripe, cached on users.payouts_enabled for fast checks (store cards, checkout). */
export async function payoutStatus(env: Env, userId: string): Promise<PayoutStatus> {
	const db = env.DB;
	const row = await db.prepare('SELECT stripe_account_id, payouts_enabled FROM users WHERE id = ?').bind(userId).first<{ stripe_account_id: string | null; payouts_enabled: number }>();
	if (!row?.stripe_account_id) return { state: 'none', due: 0, accountId: null };
	try {
		const s = toStatus(await stripeV2<V2Account>(env, 'GET', `/v2/core/accounts/${row.stripe_account_id}`, undefined, { include: INCLUDE }));
		const enabled = s.state === 'active' ? 1 : 0;
		if (enabled !== row.payouts_enabled) await db.prepare('UPDATE users SET payouts_enabled = ? WHERE id = ?').bind(enabled, userId).run();
		return s;
	} catch (e) {
		return { state: 'unavailable', due: 0, accountId: row.stripe_account_id, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Weekly payouts on Mondays (set per account; safe to repeat). */
export async function setMondayPayouts(env: Env, accountId: string) {
	await stripeV1(env, 'POST', '/v1/balance_settings', { payments: { payouts: { schedule: { interval: 'weekly', weekly_payout_days: ['monday'] } } } }, { account: accountId });
}

/** Create the seller's Stripe account if needed, then return a one-time onboarding link. */
export async function onboardingLink(env: Env, userId: string, origin: string) {
	const db = env.DB;
	const u = await db.prepare('SELECT username, email, stripe_account_id FROM users WHERE id = ?').bind(userId).first<{ username: string; email: string; stripe_account_id: string | null }>();
	if (!u) throw new StripeError('No such user.', 404);
	let accountId = u.stripe_account_id;
	if (!accountId) {
		const a = await stripeV2<V2Account>(env, 'POST', '/v2/core/accounts', {
			contact_email: u.email,
			display_name: u.username,
			dashboard: 'express',
			identity: { country: 'us' },
			defaults: { currency: 'usd', responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
			configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
			metadata: { auxriot_user_id: userId },
			include: INCLUDE
		});
		accountId = a.id;
		// Only save if nobody beat us to it (double click); otherwise use the saved one.
		const saved = await db.prepare('UPDATE users SET stripe_account_id = ? WHERE id = ? AND stripe_account_id IS NULL').bind(accountId, userId).run();
		if (!saved.meta.changes) accountId = (await db.prepare('SELECT stripe_account_id FROM users WHERE id = ?').bind(userId).first<{ stripe_account_id: string }>())!.stripe_account_id;
		await setMondayPayouts(env, accountId).catch(() => {});
	}
	const link = await stripeV2<{ url: string }>(env, 'POST', '/v2/core/account_links', {
		account: accountId,
		use_case: {
			type: 'account_onboarding',
			account_onboarding: {
				configurations: ['recipient'],
				refresh_url: `${origin}/settings/payouts?refresh=1`,
				return_url: `${origin}/settings/payouts?return=1`
			}
		}
	});
	return link.url;
}

/** One-time sign-in link to the seller's Stripe Express dashboard. */
export async function expressDashboardLink(env: Env, accountId: string) {
	const l = await stripeV1<{ url: string }>(env, 'POST', `/v1/accounts/${accountId}/login_links`);
	return l.url;
}
