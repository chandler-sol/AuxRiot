import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { verifyWebhook } from '#lib/server/stripe.ts';
import { notifyRefund, onAsyncSucceeded, onDisputeClosed, onDisputeCreated, onSessionClosed, onSessionCompleted } from '#lib/server/checkout.ts';

/**
 * Stripe webhook. Signature-checked against STRIPE_WEBHOOK_SECRET; the only
 * place orders become paid. Handlers are idempotent, since Stripe retries.
 */
export const POST: RequestHandler = async ({ request }) => {
	const env = getEnv();
	if (!env.STRIPE_WEBHOOK_SECRET) return new Response('webhook not configured', { status: 503 });
	const payload = await request.text();
	if (!(await verifyWebhook(env.STRIPE_WEBHOOK_SECRET, payload, request.headers.get('stripe-signature')))) {
		return new Response('bad signature', { status: 400 });
	}
	const event = JSON.parse(payload) as { id: string; type: string; data: { object: Record<string, unknown> } };
	const obj = event.data.object as never;
	try {
		switch (event.type) {
			case 'checkout.session.completed':
				await onSessionCompleted(env, obj);
				break;
			case 'checkout.session.async_payment_succeeded':
				await onAsyncSucceeded(env, obj);
				break;
			case 'checkout.session.async_payment_failed':
				await onSessionClosed(env, obj, 'failed');
				break;
			case 'checkout.session.expired':
				await onSessionClosed(env, obj, 'expired');
				break;
			case 'charge.refunded': {
				// Refunds issued from the Stripe dashboard: mirror them on the order.
				const c = event.data.object as { payment_intent?: string; refunded?: boolean };
				if (c.refunded && c.payment_intent) {
					const r = await env.DB.prepare(
						`UPDATE orders SET status = 'refunded', refunded_at = ?, refund_reason = COALESCE(refund_reason, 'stripe_dashboard') WHERE stripe_payment_intent = ? AND status = 'paid' RETURNING id`
					)
						.bind(Date.now(), c.payment_intent)
						.all<{ id: string }>();
					for (const o of r.results) {
						// Same beat rules as any refund: delivered (or download started) never returns to market.
						const d = await env.DB.prepare('SELECT listing_id, delivered_at, first_download_at FROM orders WHERE id = ?').bind(o.id).first<{ listing_id: string; delivered_at: number | null; first_download_at: number | null }>();
						if (d) {
							const next = d.delivered_at || d.first_download_at ? 'removed' : 'unlisted';
							await env.DB.prepare(`UPDATE listings SET status = ?, buyer_id = NULL, sold_at = NULL, producer_signed_at = CASE WHEN ? = 'unlisted' THEN NULL ELSE producer_signed_at END, updated_at = ? WHERE id = ? AND status = 'sold'`)
								.bind(next, next, Date.now(), d.listing_id)
								.run();
						}
						await notifyRefund(env, o.id);
					}
				}
				break;
			}
			case 'charge.dispute.created':
				await onDisputeCreated(env, obj);
				break;
			case 'charge.dispute.closed':
				await onDisputeClosed(env, obj);
				break;
		}
	} catch (e) {
		// A 500 makes Stripe retry later, which is what we want for transient failures.
		console.error('[stripe] webhook handler failed', event.type, event.id, e);
		return new Response('handler error', { status: 500 });
	}
	return new Response('ok');
};
