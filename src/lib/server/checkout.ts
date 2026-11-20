import { newId } from './util.ts';
import { stripeV1 } from './stripe.ts';
import { storeSettings, buyOpen, STORE_DOCS_VERSION } from './store.ts';
import { getNumberSetting } from './settings.ts';
import { splitSale } from '#lib/store.ts';
import { notifySale } from './notify.ts';
import { notify } from './notifications.ts';

/**
 * Exclusive beat checkout (Stripe Checkout, destination charge):
 * the buyer pays AuxRiot, the producer's share transfers to their connected
 * account automatically, and AuxRiot keeps the fee plus card processing
 * (application_fee_amount). One buyer per beat: a 30-minute hold covers the
 * Checkout session, and orders are only fulfilled from the signed webhook.
 */

export const HOLD_MS = 30 * 60_000;
/** Delayed payment methods (bank debits) can take days to settle; keep the beat off the market meanwhile. */
const PENDING_HOLD_MS = 7 * 86_400_000;
export const DOWNLOAD_DAYS = 7;
const TAX_KEY = 'store_tax_enabled';

type ListingForSale = {
	id: string; battle_id: string; seller_id: string; status: string; price_cents: number | null; stems_price_cents: number | null;
	stems_key: string | null; file_key: string | null; held_until: number | null; held_by: string | null;
	title: string; battle_status: string; round: number; rounds: number;
	seller_name: string; stripe_account_id: string | null; payouts_enabled: number;
};

export async function startCheckout(
	env: Env,
	buyer: SessionUser,
	listingId: string,
	opts: { stems: boolean; legalName: string; origin: string }
): Promise<{ url: string } | { error: string }> {
	const db = env.DB;
	if (!buyer.emailVerified) return { error: 'Confirm your email before buying — check your inbox for the link.' };
	const name = opts.legalName.trim().replace(/\s+/g, ' ');
	if (name.length < 3 || name.length > 100) return { error: 'Type your full legal name — it goes on the license.' };

	const l = await db
		.prepare(
			`SELECT l.id, l.battle_id, l.seller_id, l.status, l.price_cents, l.stems_price_cents, l.stems_key, l.file_key, l.held_until, l.held_by,
			        b.title, b.status AS battle_status, b.rounds, e.round, u.username AS seller_name, u.stripe_account_id, u.payouts_enabled
			 FROM listings l JOIN battles b ON b.id = l.battle_id JOIN entries e ON e.id = l.entry_id JOIN users u ON u.id = l.seller_id
			 WHERE l.id = ?`
		)
		.bind(listingId)
		.first<ListingForSale>();
	if (!l || l.status !== 'listed' || !l.price_cents || !l.file_key) return { error: 'This beat is no longer for sale.' };
	if (l.seller_id === buyer.id) return { error: "You can't buy your own beat." };
	if (!buyOpen(l.battle_status)) return { error: 'Buying opens when the battle ends.' };
	if (!l.payouts_enabled || !l.stripe_account_id) return { error: `${l.seller_name} hasn't set up payouts yet, so this beat can't be bought right now.` };
	const stems = opts.stems && !!l.stems_key && !!l.stems_price_cents;
	const priceCents = stems ? l.stems_price_cents! : l.price_cents;

	// Hold the exclusive for this buyer (or extend their own hold).
	const now = Date.now();
	const held = await db
		.prepare(
			`UPDATE listings SET held_until = ?, held_by = ? WHERE id = ? AND status = 'listed'
			   AND (held_until IS NULL OR held_until < ? OR held_by = ?)`
		)
		.bind(now + HOLD_MS, buyer.id, l.id, now, buyer.id)
		.run();
	if (!held.meta.changes) {
		const mins = l.held_until ? Math.max(1, Math.ceil((l.held_until - now) / 60_000)) : 30;
		return { error: `Someone is checking out this beat right now. If they don't finish, it's back in about ${mins} min.` };
	}

	const { feePct } = await storeSettings(db);
	const split = splitSale(priceCents, feePct);
	const orderId = newId();
	await db
		.prepare(
			`INSERT INTO orders (id, listing_id, buyer_id, seller_id, includes_stems, list_price_cents, amount_cents, platform_fee_cents,
			   processing_fee_cents, seller_net_cents, status, buyer_legal_name, buyer_signature, buyer_signed_at, license_version, expires_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
		)
		.bind(orderId, l.id, buyer.id, l.seller_id, stems ? 1 : 0, priceCents, split.paidCents, split.feeCents, split.processingCents, split.netCents,
			name, name, now, STORE_DOCS_VERSION, now + HOLD_MS, now)
		.run();

	const email = await db.prepare('SELECT email FROM users WHERE id = ?').bind(buyer.id).first<{ email: string }>();
	const taxOn = (await getNumberSetting(db, TAX_KEY, 0)) === 1;
	const label = `"${l.title}"${l.rounds > 1 ? ` (round ${l.round})` : ''} by ${l.seller_name} — exclusive license${stems ? ' + stems' : ''}`;
	try {
		const session = await stripeV1<{ id: string; url: string }>(
			env,
			'POST',
			'/v1/checkout/sessions',
			{
				mode: 'payment',
				client_reference_id: orderId,
				customer_email: email?.email,
				line_items: [
					{
						quantity: 1,
						price_data: {
							currency: 'usd',
							unit_amount: split.paidCents,
							...(taxOn ? { tax_behavior: 'exclusive' } : {}),
							product_data: { name: label.slice(0, 250), metadata: { listing_id: l.id } }
						}
					}
				],
				payment_intent_data: {
					application_fee_amount: split.feeCents + split.processingCents,
					transfer_data: { destination: l.stripe_account_id },
					description: label.slice(0, 250),
					metadata: { order_id: orderId, listing_id: l.id }
				},
				...(taxOn ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' } : {}),
				metadata: { order_id: orderId, listing_id: l.id },
				expires_at: Math.floor((now + HOLD_MS) / 1000) + 60,
				success_url: `${opts.origin}/purchases?order=${orderId}`,
				cancel_url: `${opts.origin}/battles/${l.battle_id}?canceled=${orderId}#buy`
			},
			{ idempotencyKey: `checkout:${orderId}` }
		);
		await db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').bind(session.id, orderId).run();
		return { url: session.url };
	} catch (e) {
		await releaseHold(db, l.id, buyer.id);
		await db.prepare(`UPDATE orders SET status = 'failed' WHERE id = ?`).bind(orderId).run();
		console.error('[checkout]', e);
		return { error: buyer.isAdmin && e instanceof Error ? `Stripe said: ${e.message}` : "Checkout couldn't start. Try again in a minute." };
	}
}

export async function releaseHold(db: D1Database, listingId: string, buyerId: string) {
	await db.prepare(`UPDATE listings SET held_until = NULL, held_by = NULL WHERE id = ? AND held_by = ? AND status = 'listed'`).bind(listingId, buyerId).run();
}

/** Back from Checkout without paying: free the beat right away instead of waiting out the hold. */
export async function cancelPending(db: D1Database, orderId: string, buyerId: string) {
	const o = await db.prepare(`SELECT listing_id FROM orders WHERE id = ? AND buyer_id = ? AND status = 'pending'`).bind(orderId, buyerId).first<{ listing_id: string }>();
	if (o) await releaseHold(db, o.listing_id, buyerId);
}

// ---------------------------------------------------------------------------
// Webhook handling (the only place orders become paid)

type Session = {
	id: string; payment_status: string; payment_intent: string | null; metadata?: { order_id?: string };
	total_details?: { amount_tax?: number }; amount_total?: number;
};

export async function onSessionCompleted(env: Env, s: Session) {
	const db = env.DB;
	const orderId = s.metadata?.order_id;
	if (!orderId) return;
	if (s.payment_status === 'unpaid') {
		// Delayed payment method: keep it off the market until the money settles (or fails).
		await db
			.prepare(`UPDATE listings SET held_until = ? WHERE id = (SELECT listing_id FROM orders WHERE id = ?) AND status = 'listed'`)
			.bind(Date.now() + PENDING_HOLD_MS, orderId)
			.run();
		return;
	}
	await fulfill(env, orderId, s);
}

async function fulfill(env: Env, orderId: string, s: Session) {
	const db = env.DB;
	const now = Date.now();
	const paid = await db
		.prepare(
			`UPDATE orders SET status = 'paid', paid_at = ?, stripe_session_id = ?, stripe_payment_intent = ?, tax_cents = ?
			 WHERE id = ? AND status IN ('pending', 'expired', 'failed')`
		)
		.bind(now, s.id, s.payment_intent, s.total_details?.amount_tax ?? 0, orderId)
		.run();
	if (!paid.meta.changes) return; // already handled (Stripe retries are normal)
	const o = await db.prepare('SELECT listing_id, buyer_id FROM orders WHERE id = ?').bind(orderId).first<{ listing_id: string; buyer_id: string }>();
	if (!o) return;
	const sold = await db
		.prepare(`UPDATE listings SET status = 'sold', buyer_id = ?, sold_at = ?, held_until = NULL, held_by = NULL, updated_at = ? WHERE id = ? AND status = 'listed'`)
		.bind(o.buyer_id, now, now, o.listing_id)
		.run();
	if (!sold.meta.changes) {
		// Paid for a beat that's no longer available (should not happen with holds): refund in full right away.
		console.error('[checkout] paid for unavailable listing', orderId);
		await refundOrder(env, orderId, 'unavailable').catch((e) => console.error('[checkout] auto-refund failed', e));
		return;
	}
	notifySale(db, orderId);
}

export async function onSessionClosed(env: Env, s: Session, status: 'expired' | 'failed') {
	const db = env.DB;
	const orderId = s.metadata?.order_id;
	if (!orderId) return;
	const o = await db.prepare(`SELECT listing_id, buyer_id FROM orders WHERE id = ? AND status = 'pending'`).bind(orderId).first<{ listing_id: string; buyer_id: string }>();
	if (!o) return;
	await db.prepare(`UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'`).bind(status, orderId).run();
	await releaseHold(db, o.listing_id, o.buyer_id);
}

export async function onAsyncSucceeded(env: Env, s: Session) {
	if (s.metadata?.order_id) await fulfill(env, s.metadata.order_id, s);
}

/**
 * Full refund. Pulls back the producer's transfer and returns AuxRiot's fee
 * (the ordinary refund in the Store Terms). Copyright refunds follow the same
 * money path for now; recovering the fee from the seller is handled by admins.
 */
export async function refundOrder(env: Env, orderId: string, reason: string) {
	const db = env.DB;
	const o = await db.prepare(`SELECT stripe_payment_intent, status FROM orders WHERE id = ?`).bind(orderId).first<{ stripe_payment_intent: string | null; status: string }>();
	if (!o?.stripe_payment_intent || o.status !== 'paid') throw new Error('Only paid orders can be refunded.');
	await stripeV1(env, 'POST', '/v1/refunds', { payment_intent: o.stripe_payment_intent, reverse_transfer: true, refund_application_fee: true, metadata: { order_id: orderId, reason } }, { idempotencyKey: `refund:${orderId}` });
	const done = await db.prepare(`UPDATE orders SET status = 'refunded', refunded_at = ?, refund_reason = ? WHERE id = ? AND status = 'paid'`).bind(Date.now(), reason, orderId).run();
	if (done.meta.changes) await notifyRefund(db, orderId);
}

/** Both sides hear about a refund (from admin, the webhook, or an automatic one). */
export async function notifyRefund(db: D1Database, orderId: string) {
	const o = await db
		.prepare('SELECT o.buyer_id, o.seller_id, o.amount_cents, b.title FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id WHERE o.id = ?')
		.bind(orderId)
		.first<{ buyer_id: string; seller_id: string; amount_cents: number; title: string }>();
	if (!o) return;
	const usd = `$${(o.amount_cents / 100).toFixed(2)}`;
	await notify(db, { userId: o.buyer_id, kind: 'order_refunded', text: `Refunded: ${usd} for "${o.title}" is on its way back to your card. The license is void.`, url: `/purchases?order=${orderId}` });
	await notify(db, { userId: o.seller_id, kind: 'order_refunded', text: `The sale of "${o.title}" was refunded, so its payout was reversed.`, url: `/settings/payouts` });
}

/** Buyer can download for DOWNLOAD_DAYS after paying. */
export const downloadOpenUntil = (paidAt: number) => paidAt + DOWNLOAD_DAYS * 86_400_000;
