import { newId } from './util.ts';
import { stripeV1 } from './stripe.ts';
import { storeSettings, buyOpen, STORE_DOCS_VERSION } from './store.ts';
import { getNumberSetting } from './settings.ts';
import { splitSale } from '#lib/store.ts';
import { notifySale } from './notify.ts';
import { notify } from './notifications.ts';
import { sendEmail, layout } from './email.ts';
import { businessDeadline, formatDeadline } from './bizdays.ts';
import { recordAcceptance } from './acceptances.ts';
import { merchantInfo } from './merchant.ts';
import { buyerStatement, parseRights, RECORDS_CONSENT, rightsText } from '#lib/signing.ts';
import { fileLine } from '#lib/license.ts';

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
/** Store Terms §6: an undelivered order expires 14 calendar days after the files become available. */
export const DELIVERY_DAYS = 14;
const DAY = 86_400_000;
const TAX_KEY = 'store_tax_enabled';

type ListingForSale = {
	id: string; battle_id: string; seller_id: string; status: string; price_cents: number | null; stems_price_cents: number | null;
	stems_key: string | null; file_key: string | null; held_until: number | null; held_by: string | null;
	file_name: string | null; file_size: number | null; file_format: string | null; tagged: number; stems_name: string | null;
	license_version: string | null; producer_signed_at: number | null; producer_signature: string | null; producer_capacity: string | null; producer_entity: string | null;
	producer_credit: string | null; producer_acceptance_id: string | null; listing_version: number; rights_schedule: string | null;
	title: string; battle_status: string; round: number; rounds: number;
	seller_name: string; stripe_account_id: string | null; payouts_enabled: number;
};

export async function startCheckout(
	env: Env,
	buyer: SessionUser,
	listingId: string,
	opts: {
		stems: boolean; legalName: string; origin: string; returnPath?: string;
		/** v5 signing: who signs, for whom, and the separate electronic-records consent */
		entity?: string; capacity?: string; agreed: boolean; recordsConsent: boolean; country?: string | null; request?: Request;
	}
): Promise<{ url: string } | { error: string }> {
	const db = env.DB;
	if (!buyer.emailVerified) return { error: 'Confirm your email before buying — check your inbox for the link.' };
	// Store Terms §1: purchases only in checkout locations we support (the US for now).
	if (opts.country && opts.country !== 'US' && opts.country !== 'XX') return { error: 'Checkout is open to buyers in the United States for now.' };
	const name = opts.legalName.trim().replace(/\s+/g, ' ');
	if (name.length < 3 || name.length > 100) return { error: 'Type your full legal name — it goes on the license.' };
	const entity = (opts.entity ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
	const capacity = entity ? (opts.capacity ?? '').trim().replace(/\s+/g, ' ').slice(0, 60) : 'self';
	if (entity && capacity.length < 2) return { error: 'Add your role at the company you are signing for.' };
	if (!opts.agreed) return { error: 'Tick the box to sign the license and Store Terms.' };
	if (!opts.recordsConsent) return { error: 'Agree to receive the order records electronically to continue.' };

	const l = await db
		.prepare(
			`SELECT l.id, l.battle_id, l.seller_id, l.status, l.price_cents, l.stems_price_cents, l.stems_key, l.file_key, l.held_until, l.held_by,
			        l.file_name, l.file_size, l.file_format, l.tagged, l.stems_name, l.license_version, l.producer_signed_at, l.producer_signature, l.producer_capacity,
			        l.producer_entity, l.producer_credit, l.producer_acceptance_id, l.listing_version, l.rights_schedule,
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
	if (!l.producer_signed_at || l.license_version !== STORE_DOCS_VERSION) return { error: `${l.seller_name} needs to sign the updated listing before this beat can be bought.` };
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
	const merchant = await merchantInfo(db);
	// Freeze what's being licensed: files with their storage identifiers, rights, signer, credit.
	const [fileHead, stemsHead] = await Promise.all([env.AUDIO.head(l.file_key), stems && l.stems_key ? env.AUDIO.head(l.stems_key) : Promise.resolve(null)]);
	const manifest = {
		file: fileLine(l.file_name, l.file_format, !!l.tagged, l.file_size, fileHead?.etag ?? null),
		stems: stems ? `${l.stems_name ?? 'stems.zip'}${stemsHead?.etag ? ` (file id ${stemsHead.etag})` : ''}` : null,
		rights: rightsText(parseRights(l.rights_schedule)),
		credit: l.producer_credit ?? l.seller_name,
		producer: { name: l.producer_signature ?? '', capacity: l.producer_capacity, entity: l.producer_entity, at: l.producer_signed_at }
	};
	const beatAndPackage = `"${l.title}"${l.rounds > 1 ? ` (round ${l.round})` : ''}, ${stems ? 'Exclusive + Stems' : 'Exclusive'}`;
	const total = `$${(split.paidCents / 100).toFixed(2)}`;
	const statement = `${buyerStatement(beatAndPackage, total)}\n${RECORDS_CONSENT}`;
	const acceptanceId = await recordAcceptance(env, {
		kind: 'order', userId: buyer.id, subjectId: orderId, docVersion: STORE_DOCS_VERSION, signerName: name, capacity, entity: entity || null, statement, request: opts.request,
		snapshot: { listing_id: l.id, listing_version: l.listing_version, price_cents: split.paidCents, stems, manifest, merchant: merchant.line, producer_acceptance_id: l.producer_acceptance_id }
	});
	await db
		.prepare(
			`INSERT INTO orders (id, listing_id, buyer_id, seller_id, includes_stems, list_price_cents, amount_cents, platform_fee_cents,
			   processing_fee_cents, seller_net_cents, status, buyer_legal_name, buyer_signature, buyer_signed_at, license_version, expires_at, created_at,
			   buyer_capacity, buyer_entity, buyer_acceptance_id, producer_acceptance_id, listing_version, records_consent_at, store_terms_version, merchant, file_manifest)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(orderId, l.id, buyer.id, l.seller_id, stems ? 1 : 0, priceCents, split.paidCents, split.feeCents, split.processingCents, split.netCents,
			name, name, now, STORE_DOCS_VERSION, now + HOLD_MS, now,
			capacity, entity || null, acceptanceId, l.producer_acceptance_id, l.listing_version, now, STORE_DOCS_VERSION, merchant.line, JSON.stringify(manifest))
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
				cancel_url: `${opts.origin}${opts.returnPath ?? `/battles/${l.battle_id}`}?canceled=${orderId}#buy`
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
			`UPDATE orders SET status = 'paid', paid_at = ?, files_available_at = ?, stripe_session_id = ?, stripe_payment_intent = ?, tax_cents = ?
			 WHERE id = ? AND status IN ('pending', 'expired', 'failed')`
		)
		.bind(now, now, s.id, s.payment_intent, s.total_details?.amount_tax ?? 0, orderId)
		.run();
	if (!paid.meta.changes) return; // already handled (Stripe retries are normal)
	const o = await db.prepare('SELECT listing_id, buyer_id FROM orders WHERE id = ?').bind(orderId).first<{ listing_id: string; buyer_id: string }>();
	if (!o) return;
	// Reserved for this buyer (status 'sold', no sold_at): off the market for everyone else.
	// sold_at, and the SOLD stamp, arrive with the first completed delivery (markDelivered).
	const sold = await db
		.prepare(`UPDATE listings SET status = 'sold', buyer_id = ?, sold_at = NULL, held_until = NULL, held_by = NULL, updated_at = ? WHERE id = ? AND status = 'listed'`)
		.bind(o.buyer_id, now, o.listing_id)
		.run();
	if (!sold.meta.changes) {
		// Paid for a beat that's no longer available (should not happen with holds): refund in full right away.
		console.error('[checkout] paid for unavailable listing', orderId);
		await refundOrder(env, orderId, 'unavailable', { fault: 'auxriot' }).catch((e) => console.error('[checkout] auto-refund failed', e));
		return;
	}
	notifySale(db, orderId);
	await sendReceipts(env, orderId).catch((e) => console.error('[checkout] receipt', e));
}

/**
 * License §7: each party gets the completed agreement and a receipt. The buyer's receipt
 * names the licensor, the card merchant and statement descriptor (Store Terms §5).
 */
export async function sendReceipts(env: Env, orderId: string) {
	const db = env.DB;
	const o = await db
		.prepare(
			`SELECT o.id, o.amount_cents, o.tax_cents, o.includes_stems, o.paid_at, o.merchant, o.buyer_legal_name, o.receipt_sent_at, o.files_available_at,
			        b.title, b.rounds, e.round, bu.email AS buyer_email, su.email AS seller_email, su.username AS seller, o.seller_net_cents, o.platform_fee_cents, o.processing_fee_cents
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN entries e ON e.id = l.entry_id
			 JOIN users bu ON bu.id = o.buyer_id JOIN users su ON su.id = o.seller_id WHERE o.id = ?`
		)
		.bind(orderId)
		.first<{
			id: string; amount_cents: number; tax_cents: number; includes_stems: number; paid_at: number; merchant: string | null; buyer_legal_name: string | null;
			receipt_sent_at: number | null; files_available_at: number | null; title: string; rounds: number; round: number; buyer_email: string; seller_email: string; seller: string;
			seller_net_cents: number; platform_fee_cents: number; processing_fee_cents: number;
		}>();
	if (!o || o.receipt_sent_at) return;
	await db.prepare('UPDATE orders SET receipt_sent_at = ? WHERE id = ? AND receipt_sent_at IS NULL').bind(Date.now(), orderId).run();
	const $ = (c: number) => `$${(c / 100).toFixed(2)}`;
	const title = `${o.title}${o.rounds > 1 ? ` (round ${o.round})` : ''}`;
	const ref = o.id.toUpperCase();
	const by = new Date((o.files_available_at ?? o.paid_at) + DELIVERY_DAYS * DAY).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
	const rows = [
		['Order', ref],
		['Beat', `"${title}" by @${o.seller}`],
		['Package', o.includes_stems ? 'Exclusive + Stems license' : 'Exclusive license'],
		['License price', $(o.amount_cents)],
		['Tax', $(o.tax_cents)],
		['Total charged', $(o.amount_cents + o.tax_cents)],
		['Paid', new Date(o.paid_at).toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })],
		['Payment', o.merchant ?? '']
	];
	const table = `<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:4px 8px 4px 0;color:#888">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>`;
	await sendEmail(env, {
		to: o.buyer_email,
		idempotencyKey: `receipt-buyer:${orderId}`,
		subject: `Receipt and license: "${title}"`,
		html: layout({
			kicker: 'Receipt · signed agreement',
			headline: 'Reserved for you',
			body: `<p>Thanks${o.buyer_legal_name ? `, ${esc(o.buyer_legal_name)}` : ''}. Your signed Exclusive Beat License is ready to view and save.</p>${table}<p>Your exclusive license starts when your first download of the beat or stems finishes. Until then you can cancel for a full refund from your purchases page. Download by ${esc(by)} or the order is canceled and refunded automatically.</p><p>This receipt summarizes the deal. It isn't a government registration or independent verification of ownership.</p>`,
			button: 'Download and view license',
			url: `https://auxriot.com/purchases?order=${orderId}`,
			footer: `Order ${ref} · Questions or refunds: hello@auxriot.com`
		}),
		text: `Receipt for "${title}"\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nDownload by ${by}. License and files: https://auxriot.com/purchases?order=${orderId}`
	}).catch(() => {});
	await sendEmail(env, {
		to: o.seller_email,
		idempotencyKey: `receipt-seller:${orderId}`,
		subject: `Sold (reserved): "${title}"`,
		html: layout({
			kicker: 'Sale · signed agreement',
			headline: 'Your beat is reserved',
			body: `<p>A buyer paid for "${esc(title)}" and signed the Exclusive Beat License. The sale becomes final when they finish their first download.</p><ul><li>Price: ${$(o.amount_cents)}</li><li>AuxRiot fee: ${$(o.platform_fee_cents)}</li><li>Card processing: ${$(o.processing_fee_cents)}</li><li>Your net: ${$(o.seller_net_cents)}</li></ul><p>Payouts go out weekly from your available Stripe balance.</p>`,
			button: 'View the signed license',
			url: `https://auxriot.com/purchases/${orderId}/license`,
			footer: `Order ${ref}`
		}),
		text: `"${title}" is reserved for a buyer. Net ${$(o.seller_net_cents)}. License: https://auxriot.com/purchases/${orderId}/license`
	}).catch(() => {});
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

export type RefundReason =
	| 'buyer_cancel' // buyer canceled before first delivery
	| 'expired' // nothing delivered within 14 days
	| 'copyright_block' // files blocked by a copyright notice (requested or automatic)
	| 'buyer_request'
	| 'defect'
	| 'copyright'
	| 'unavailable'
	| 'other';

/**
 * Who carries the cost of a refund (Store Terms §8):
 *  - ordinary: an ordinary reversal or seller-caused problem. The seller gives back their
 *    net and bears card processing; AuxRiot returns its 20% fee.
 *  - auxriot: a disputed copyright claim, card fraud, or our error. The sale unwinds at
 *    net proceeds and AuxRiot bears the processing cost.
 *  - auxriot_restore: our error on a fulfilled sale, or a demonstrably mistaken claim.
 *    As above, then AuxRiot pays the innocent seller's net back to them.
 */
export type RefundFault = 'ordinary' | 'auxriot' | 'auxriot_restore';

const FAULT_FOR: Record<string, RefundFault> = { copyright_block: 'auxriot', copyright: 'auxriot', unavailable: 'auxriot' };

export type RefundBreakdown = {
	reason: string; fault: RefundFault; refundedToBuyerCents: number; taxCents: number;
	sellerReturnsCents: number; processingBorneBySellerCents: number; feeReturnedByAuxRiotCents: number; restoredToSellerCents: number;
};

type RefundRow = {
	stripe_payment_intent: string | null; status: string; listing_id: string; transfer_reversed: number; delivered_at: number | null; first_download_at: number | null;
	amount_cents: number; tax_cents: number; platform_fee_cents: number; processing_fee_cents: number; seller_net_cents: number; seller_id: string; stripe_account_id: string | null;
};

/**
 * Full refund to the buyer, including tax. What happens to the beat afterwards:
 *  - delivered before (or a download was under way): never back on the market (Store Terms §6);
 *  - copyright: removed;
 *  - otherwise: unlisted. The producer may sign again and relist it.
 */
export async function refundOrder(env: Env, orderId: string, reason: RefundReason | string, opts: { fault?: RefundFault } = {}) {
	const db = env.DB;
	const fault: RefundFault = opts.fault ?? FAULT_FOR[reason] ?? 'ordinary';
	const o = await db
		.prepare(
			`SELECT o.stripe_payment_intent, o.status, o.listing_id, o.transfer_reversed, o.delivered_at, o.first_download_at, o.amount_cents, o.tax_cents,
			        o.platform_fee_cents, o.processing_fee_cents, o.seller_net_cents, o.seller_id, u.stripe_account_id
			 FROM orders o JOIN users u ON u.id = o.seller_id WHERE o.id = ?`
		)
		.bind(orderId)
		.first<RefundRow>();
	if (!o?.stripe_payment_intent || o.status !== 'paid') throw new Error('Only paid orders can be refunded.');

	// Money. With a destination charge the whole amount was transferred to the seller and our
	// application fee (20% + processing) taken back from it. Reversing the transfer pulls the
	// full amount back; refunding (part of) the application fee decides who bears what.
	const alreadyReversed = !!o.transfer_reversed; // a chargeback already unwound the seller side
	const feeBack = alreadyReversed ? 0 : fault === 'ordinary' ? o.platform_fee_cents : o.platform_fee_cents + o.processing_fee_cents;
	await stripeV1(
		env,
		'POST',
		'/v1/refunds',
		{
			payment_intent: o.stripe_payment_intent,
			...(alreadyReversed ? {} : { reverse_transfer: true }),
			refund_application_fee: !alreadyReversed && fault !== 'ordinary',
			metadata: { order_id: orderId, reason, fault }
		},
		{ idempotencyKey: `refund:${orderId}` }
	);
	if (!alreadyReversed && fault === 'ordinary' && feeBack > 0) {
		// Give back only our 20% fee; the seller carries the actual processing cost.
		const pi = await stripeV1<{ latest_charge?: { application_fee?: string | null } | null }>(env, 'GET', `/v1/payment_intents/${o.stripe_payment_intent}`, { expand: ['latest_charge'] });
		const fee = pi.latest_charge?.application_fee;
		if (fee) await stripeV1(env, 'POST', `/v1/application_fees/${fee}/refunds`, { amount: feeBack, metadata: { order_id: orderId } }, { idempotencyKey: `fee-refund:${orderId}` });
	}
	let restored = 0;
	if (fault === 'auxriot_restore' && o.stripe_account_id) {
		await stripeV1(
			env,
			'POST',
			'/v1/transfers',
			{ amount: o.seller_net_cents, currency: 'usd', destination: o.stripe_account_id, metadata: { order_id: orderId, reason: 'restore_net' } },
			{ idempotencyKey: `restore:${orderId}` }
		);
		restored = o.seller_net_cents;
	}

	const breakdown: RefundBreakdown = {
		reason, fault,
		refundedToBuyerCents: o.amount_cents + o.tax_cents,
		taxCents: o.tax_cents,
		sellerReturnsCents: alreadyReversed ? 0 : o.seller_net_cents,
		processingBorneBySellerCents: !alreadyReversed && fault === 'ordinary' ? o.processing_fee_cents : 0,
		feeReturnedByAuxRiotCents: feeBack,
		restoredToSellerCents: restored
	};
	const now = Date.now();
	const done = await db
		.prepare(`UPDATE orders SET status = 'refunded', refunded_at = ?, refund_reason = ?, refund_fault = ?, refund_breakdown = ?, transfer_reversed = 1 WHERE id = ? AND status = 'paid'`)
		.bind(now, reason, fault, JSON.stringify(breakdown), orderId)
		.run();
	if (!done.meta.changes) return;
	const touched = !!(o.delivered_at || o.first_download_at);
	const next = reason === 'copyright' || reason === 'copyright_block' || touched ? 'removed' : 'unlisted';
	// Unlisted beats need a fresh signature before they can be relisted (Store Terms §6).
	await db
		.prepare(
			`UPDATE listings SET status = ?, buyer_id = NULL, sold_at = NULL, held_until = NULL, held_by = NULL,
			   producer_signed_at = CASE WHEN ? = 'unlisted' THEN NULL ELSE producer_signed_at END, updated_at = ?
			 WHERE id = ? AND status = 'sold'`
		)
		.bind(next, next, now, o.listing_id)
		.run();
	await notifyRefund(env, orderId, breakdown, next);
}

/** Buyer cancels before the first delivery (Store Terms §6): full refund, takes effect on receipt. */
export async function cancelBeforeDelivery(env: Env, orderId: string, buyerId: string): Promise<{ ok: true } | { error: string }> {
	const o = await env.DB.prepare('SELECT status, delivered_at FROM orders WHERE id = ? AND buyer_id = ?').bind(orderId, buyerId).first<{ status: string; delivered_at: number | null }>();
	if (!o || o.status !== 'paid') return { error: 'This order is not active.' };
	if (o.delivered_at) return { error: 'Your files were already delivered, so the license is active. For a problem with the files, email hello@auxriot.com.' };
	// Close delivery first, so a download finishing in the meantime can't activate the license.
	await env.DB.prepare(`UPDATE orders SET block_note = COALESCE(block_note, 'canceling') WHERE id = ?`).bind(orderId).run();
	try {
		await refundOrder(env, orderId, 'buyer_cancel');
	} catch (e) {
		await env.DB.prepare(`UPDATE orders SET block_note = NULL WHERE id = ? AND block_note = 'canceling' AND status = 'paid'`).bind(orderId).run();
		throw e;
	}
	return { ok: true };
}

/**
 * First completed private delivery of audio or stems: the exclusive license is now active
 * and the beat is SOLD for good. Ignored if the order was canceled first.
 */
export async function markDelivered(db: D1Database, orderId: string) {
	const now = Date.now();
	const r = await db
		.prepare(`UPDATE orders SET delivered_at = ? WHERE id = ? AND status = 'paid' AND delivered_at IS NULL AND blocked_at IS NULL AND block_note IS NULL`)
		.bind(now, orderId)
		.run();
	if (!r.meta.changes) return;
	await db.prepare(`UPDATE listings SET sold_at = ?, updated_at = ? WHERE id = (SELECT listing_id FROM orders WHERE id = ?) AND status = 'sold'`).bind(now, now, orderId).run();
	const o = await db
		.prepare('SELECT o.seller_id, b.title FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id WHERE o.id = ?')
		.bind(orderId)
		.first<{ seller_id: string; title: string }>();
	if (o) await notify(db, { userId: o.seller_id, kind: 'beat_sold', text: `The buyer downloaded "${o.title}". The exclusive license is active and the sale is final.`, url: '/settings/payouts' }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Copyright notices that block paid files (Store Terms §7)

async function orderParties(db: D1Database, orderId: string) {
	return db
		.prepare(
			`SELECT o.id, o.status, o.buyer_id, o.seller_id, o.delivered_at, o.blocked_at, o.block_deadline, b.title, bu.email AS buyer_email, bu.username AS buyer_name,
			        su.email AS seller_email, su.username AS seller_name
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN users bu ON bu.id = o.buyer_id JOIN users su ON su.id = o.seller_id
			 WHERE o.id = ?`
		)
		.bind(orderId)
		.first<{ id: string; status: string; buyer_id: string; seller_id: string; delivered_at: number | null; blocked_at: number | null; block_deadline: number | null; title: string; buyer_email: string; buyer_name: string; seller_email: string; seller_name: string }>();
}

/** Admin: a valid copyright notice blocks this order's files. Emails both sides the exact deadline. */
export async function blockForCopyright(env: Env, orderId: string, note: string, opts: { strike?: boolean; origin: string }) {
	const db = env.DB;
	const o = await orderParties(db, orderId);
	if (!o || o.status !== 'paid') throw new Error('Only active orders can be blocked.');
	if (o.blocked_at) throw new Error('Already blocked.');
	const now = Date.now();
	const deadline = businessDeadline(now);
	await db.prepare('UPDATE orders SET blocked_at = ?, block_deadline = ?, block_note = ? WHERE id = ?').bind(now, deadline, note.slice(0, 500) || 'copyright notice', orderId).run();
	if (opts.strike) await db.prepare('UPDATE users SET copyright_strikes = copyright_strikes + 1 WHERE id = ?').bind(o.seller_id).run();
	const when = formatDeadline(deadline);
	const buyerText = `Your files for "${o.title}" are temporarily unavailable. Reply now for a full refund, or wait. If your files are still blocked on ${when}, we'll start your full refund automatically. If your access returns by then and you haven't requested a refund, your order continues.`;
	await notify(db, { userId: o.buyer_id, kind: 'order_refunded', text: `Files for "${o.title}" are blocked by a copyright notice. Refund any time, or automatically on ${when}.`, url: `/purchases?order=${orderId}` });
	await notify(db, { userId: o.seller_id, kind: 'order_refunded', text: `A copyright notice blocked the files for "${o.title}". If access is still blocked on ${when}, the buyer is refunded automatically.`, url: '/settings/payouts' });
	await sendEmail(env, {
		to: o.buyer_email,
		idempotencyKey: `block-buyer:${orderId}:${now}`,
		subject: `Your files for "${o.title}" are temporarily unavailable`,
		html: layout({ kicker: 'Order update', headline: 'Files temporarily unavailable', body: `<p>${esc(buyerText)}</p>`, button: 'Refund me now', url: `${opts.origin}/purchases?order=${orderId}`, footer: `Order ${orderId.toUpperCase()} · Questions: hello@auxriot.com` }),
		text: `${buyerText}\n\nRefund now: ${opts.origin}/purchases?order=${orderId}`
	}).catch(() => {});
	await sendEmail(env, {
		to: o.seller_email,
		idempotencyKey: `block-seller:${orderId}:${now}`,
		subject: `A copyright notice blocked "${o.title}"`,
		html: layout({ kicker: 'Store notice', headline: 'Files blocked by a copyright notice', body: `<p>We received a copyright notice and blocked the purchased files for "${esc(o.title)}". The buyer may ask for a full refund now. If access is still blocked on ${when}, we start a full refund automatically.</p><p>A notice alone doesn't establish a breach. You'll normally have ten business days to respond with evidence before any final decision. Reply to hello@auxriot.com.</p>`, button: 'See your sales', url: `${opts.origin}/settings/payouts`, footer: `Order ${orderId.toUpperCase()}` }),
		text: `We blocked the purchased files for "${o.title}" after a copyright notice. Automatic refund if still blocked on ${when}. Reply to hello@auxriot.com with evidence.`
	}).catch(() => {});
	return deadline;
}

/** Admin: access is lawfully restored before the deadline. The order continues. */
export async function unblockOrder(env: Env, orderId: string) {
	const db = env.DB;
	const o = await orderParties(db, orderId);
	if (!o?.blocked_at || o.status !== 'paid') throw new Error('This order is not blocked.');
	// If the block happened before delivery, give the buyer a fresh 14-day window.
	await db.prepare(`UPDATE orders SET blocked_at = NULL, block_deadline = NULL, block_note = NULL, files_available_at = CASE WHEN delivered_at IS NULL THEN ? ELSE files_available_at END WHERE id = ?`).bind(Date.now(), orderId).run();
	await notify(db, { userId: o.buyer_id, kind: 'order_refunded', text: `Good news: your files for "${o.title}" are available again. Your order continues.`, url: `/purchases?order=${orderId}` });
	await notify(db, { userId: o.seller_id, kind: 'order_refunded', text: `Access to "${o.title}" was restored. The order continues.`, url: '/settings/payouts' });
}

// ---------------------------------------------------------------------------
// The cron's part (every 15 min): expire undelivered orders, and refund blocked
// ones that hit their deadline.

export async function runOrderTimers(env: Env) {
	const db = env.DB;
	const now = Date.now();
	if (!env.STRIPE_SECRET_KEY) return;
	const blocked = await db.prepare(`SELECT id FROM orders WHERE status = 'paid' AND blocked_at IS NOT NULL AND block_deadline <= ? LIMIT 20`).bind(now).all<{ id: string }>();
	for (const o of blocked.results) await refundOrder(env, o.id, 'copyright_block').catch((e) => console.error('[timers] block refund', o.id, e));

	const expired = await db
		.prepare(`SELECT id FROM orders WHERE status = 'paid' AND delivered_at IS NULL AND blocked_at IS NULL AND files_available_at <= ? LIMIT 20`)
		.bind(now - DELIVERY_DAYS * DAY)
		.all<{ id: string }>();
	for (const o of expired.results) await refundOrder(env, o.id, 'expired').catch((e) => console.error('[timers] expiry refund', o.id, e));

	// Three days before expiry, remind the buyer once.
	const soon = await db
		.prepare(
			`SELECT o.id, o.buyer_id, o.files_available_at, b.title FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id
			 WHERE o.status = 'paid' AND o.delivered_at IS NULL AND o.blocked_at IS NULL AND o.expiry_reminded_at IS NULL AND o.files_available_at <= ? LIMIT 50`
		)
		.bind(now - (DELIVERY_DAYS - 3) * DAY)
		.all<{ id: string; buyer_id: string; files_available_at: number; title: string }>();
	for (const o of soon.results) {
		await db.prepare('UPDATE orders SET expiry_reminded_at = ? WHERE id = ?').bind(now, o.id).run();
		const by = new Date(o.files_available_at + DELIVERY_DAYS * DAY).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });
		await notify(db, { userId: o.buyer_id, kind: 'order_refunded', text: `Download "${o.title}" by ${by} or the order is canceled and refunded automatically.`, url: `/purchases?order=${o.id}` }).catch(() => {});
	}
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------------------------------------------------------------------------
// Disputes (chargebacks). AuxRiot carries dispute losses, so while a dispute is
// open the producer's transfer is pulled back; if we win, they're paid again.

type Dispute = { id: string; charge: string; payment_intent?: string | null; status: string; amount: number };

async function orderForDispute(db: D1Database, d: Dispute) {
	return db
		.prepare(
			`SELECT o.id, o.seller_id, o.seller_net_cents, o.transfer_reversed, o.listing_id, b.title, u.stripe_account_id
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN users u ON u.id = o.seller_id
			 WHERE o.stripe_payment_intent = ?`
		)
		.bind(d.payment_intent ?? '')
		.first<{ id: string; seller_id: string; seller_net_cents: number; transfer_reversed: number; listing_id: string; title: string; stripe_account_id: string | null }>();
}

export async function onDisputeCreated(env: Env, d: Dispute) {
	const db = env.DB;
	const o = await orderForDispute(db, d);
	if (!o) return;
	await db.prepare('UPDATE orders SET dispute_status = ?, disputed_at = COALESCE(disputed_at, ?) WHERE id = ?').bind(d.status, Date.now(), o.id).run();
	if (!o.transfer_reversed) {
		const charge = await stripeV1<{ transfer?: string | null }>(env, 'GET', `/v1/charges/${d.charge}`);
		if (charge.transfer) {
			// Return our application fee with the reversal, so the seller ends at zero (not below) while it's open.
			await stripeV1(env, 'POST', `/v1/transfers/${charge.transfer}/reversals`, { refund_application_fee: true, metadata: { order_id: o.id, reason: 'dispute' } }, { idempotencyKey: `dispute-reversal:${o.id}` });
			await db.prepare('UPDATE orders SET transfer_reversed = 1 WHERE id = ?').bind(o.id).run();
		}
	}
	await notify(db, { userId: o.seller_id, kind: 'order_refunded', text: `A buyer disputed the charge for "${o.title}" with their bank. Your payout for it is on hold while AuxRiot responds.`, url: '/settings/payouts' });
	await notifyAdmins(db, `Chargeback opened on "${o.title}" ($${(d.amount / 100).toFixed(2)}). Respond in Stripe → Disputes before the deadline.`, '/admin/orders?status=disputed');
}

export async function onDisputeClosed(env: Env, d: Dispute) {
	const db = env.DB;
	const o = await orderForDispute(db, d);
	if (!o) return;
	await db.prepare('UPDATE orders SET dispute_status = ? WHERE id = ?').bind(d.status, o.id).run();
	if (d.status === 'won' && o.transfer_reversed && o.stripe_account_id) {
		// We kept the money: pay the producer their share again.
		await stripeV1(
			env,
			'POST',
			'/v1/transfers',
			{ amount: o.seller_net_cents, currency: 'usd', destination: o.stripe_account_id, source_transaction: d.charge, metadata: { order_id: o.id, reason: 'dispute_won' } },
			{ idempotencyKey: `dispute-repay:${o.id}` }
		);
		await db.prepare('UPDATE orders SET transfer_reversed = 0 WHERE id = ?').bind(o.id).run();
		await notify(db, { userId: o.seller_id, kind: 'order_refunded', text: `Good news: the dispute on "${o.title}" was decided in your favor. Your payout is back on its way.`, url: '/settings/payouts' });
	} else if (d.status === 'lost') {
		await db
			.prepare(`UPDATE orders SET status = 'refunded', refunded_at = ?, refund_reason = 'dispute_lost' WHERE id = ? AND status = 'paid'`)
			.bind(Date.now(), o.id)
			.run();
		// A final full reversal works like a refund: a delivered beat never returns to market.
		const d0 = await db.prepare('SELECT delivered_at, first_download_at FROM orders WHERE id = ?').bind(o.id).first<{ delivered_at: number | null; first_download_at: number | null }>();
		const next = d0?.delivered_at || d0?.first_download_at ? 'removed' : 'unlisted';
		await db.prepare(`UPDATE listings SET status = ?, buyer_id = NULL, sold_at = NULL, producer_signed_at = CASE WHEN ? = 'unlisted' THEN NULL ELSE producer_signed_at END, updated_at = ? WHERE id = ? AND status = 'sold'`).bind(next, next, Date.now(), o.listing_id).run();
		await notify(db, { userId: o.seller_id, kind: 'order_refunded', text: next === 'removed' ? `The dispute on "${o.title}" was lost, so the sale was reversed. The files were delivered, so the beat can't be sold again.` : `The dispute on "${o.title}" was lost, so the sale was reversed. Sign the listing again if you want to relist it.`, url: '/settings/payouts' });
	}
	await notifyAdmins(db, `Chargeback on "${o.title}" closed: ${d.status}.`, '/admin/orders?status=disputed');
}

async function notifyAdmins(db: D1Database, text: string, url: string) {
	const admins = await db.prepare('SELECT id FROM users WHERE is_admin = 1').all<{ id: string }>();
	for (const a of admins.results) await notify(db, { userId: a.id, kind: 'report_actioned', text, url }).catch(() => {});
}

const REASON_TEXT: Record<string, string> = {
	buyer_cancel: 'the buyer canceled before downloading',
	expired: 'the files were not downloaded within 14 days',
	copyright_block: 'a copyright notice blocked the files',
	copyright: 'a copyright claim',
	defect: 'missing or defective files',
	unavailable: 'the beat was no longer available',
	buyer_request: 'a buyer request',
	dispute_lost: 'a lost chargeback'
};

/** Both sides hear about a refund; the seller gets an itemized notice (Store Terms §8). */
export async function notifyRefund(env: Env, orderId: string, b?: RefundBreakdown, listing?: string) {
	const db = env.DB;
	const o = await db
		.prepare('SELECT o.buyer_id, o.seller_id, o.amount_cents, o.tax_cents, o.refund_reason, b.title, su.email AS seller_email FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN users su ON su.id = o.seller_id WHERE o.id = ?')
		.bind(orderId)
		.first<{ buyer_id: string; seller_id: string; amount_cents: number; tax_cents: number; refund_reason: string | null; title: string; seller_email: string }>();
	if (!o) return;
	const $ = (c: number) => `$${(c / 100).toFixed(2)}`;
	const why = REASON_TEXT[b?.reason ?? o.refund_reason ?? ''] ?? 'a refund';
	await notify(db, { userId: o.buyer_id, kind: 'order_refunded', text: `Refunded: ${$(o.amount_cents + o.tax_cents)} for "${o.title}" is on its way back to your card (${why}). The order is canceled.`, url: `/purchases?order=${orderId}` });
	const lines = b
		? [
				`Reason: ${why}`,
				b.sellerReturnsCents ? `Your payout returned: ${$(b.sellerReturnsCents)}` : 'Your payout was already on hold, nothing more is taken.',
				b.processingBorneBySellerCents ? `Card processing (not refunded by the processor): ${$(b.processingBorneBySellerCents)}` : 'Card processing: covered by AuxRiot',
				`AuxRiot fee returned: ${$(b.feeReturnedByAuxRiotCents)}`,
				...(b.restoredToSellerCents ? [`Your net restored by AuxRiot: ${$(b.restoredToSellerCents)}`] : []),
				`Net change to your balance: −${$(b.processingBorneBySellerCents)}${b.restoredToSellerCents ? ` (after restoring ${$(b.restoredToSellerCents)})` : ''}`
			]
		: [`Reason: ${why}`];
	const after = listing === 'unlisted' ? ' The beat was never delivered, so you can sign the listing again to relist it.' : listing === 'removed' ? " The beat can't be sold again." : '';
	await notify(db, { userId: o.seller_id, kind: 'order_refunded', text: `The sale of "${o.title}" was refunded (${why}).${b?.processingBorneBySellerCents ? ` You carry the ${$(b.processingBorneBySellerCents)} card processing.` : ''}${after}`, url: `/settings/payouts` });
	if (b && o.seller_email)
		await sendEmail(env, {
			to: o.seller_email,
			idempotencyKey: `refund-notice:${orderId}`,
			subject: `Refund notice: "${o.title}"`,
			html: layout({ kicker: 'Itemized refund notice', headline: 'A sale was refunded', body: `<p>The sale of "${esc(o.title)}" was refunded to the buyer.</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p>${esc(after.trim())}</p><p>Think this is wrong? Reply to hello@auxriot.com within 30 days and we'll review it.</p>`, button: 'Open payouts', url: 'https://auxriot.com/settings/payouts', footer: `Order ${orderId.toUpperCase()} · Store Terms §8` }),
			text: `The sale of "${o.title}" was refunded.\n${lines.join('\n')}\n${after}\nDispute within 30 days: hello@auxriot.com`
		}).catch(() => {});
}
