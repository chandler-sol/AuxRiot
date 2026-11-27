<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { money } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let confirmCancel = $state<string | null>(null);
	let busy = $state(false);
	const REFUND_WHY: Record<string, string> = {
		buyer_cancel: 'You canceled before downloading.',
		expired: 'Nothing was downloaded within 14 days, so the order was canceled.',
		copyright_block: 'A copyright notice blocked the files.'
	};
	// Just back from Stripe: the webhook usually lands within seconds. Re-check until the order shows as paid.
	const waiting = $derived(data.orders.some((o) => o.id === data.highlight && o.status === 'pending'));
	$effect(() => {
		if (!waiting) return;
		let tries = 0;
		const t = setInterval(() => {
			if (++tries > 20) return clearInterval(t);
			invalidate('app:purchases');
		}, 2500);
		return () => clearInterval(t);
	});
	const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<svelte:head><title>Your purchases · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Your purchases</p>
<h1 class="headline">Your <span>beats.</span></h1>

{#if !data.orders.length}
	<p class="muted">Nothing here yet. <a href="/store">Browse the store →</a></p>
{/if}

<ul class="orders">
	{#each data.orders as o (o.id)}
		<li class="order" class:hl={o.id === data.highlight}>
			<div class="top">
				<div>
					<a class="display t" href="/battles/{o.battle_id}">{o.title}</a>
					<p class="mono small muted">by {o.seller} · exclusive{o.includes_stems ? ' + stems' : ''} · order {o.id.slice(0, 8).toUpperCase()}</p>
				</div>
				<p class="display price">{money(o.amount_cents)}{#if o.tax_cents}<span class="mono small muted"> + {money(o.tax_cents)} tax</span>{/if}</p>
			</div>

			{#if o.status === 'pending'}
				<p class="mono small wait">Confirming your payment with Stripe…</p>
			{:else if o.status === 'refunded'}
				<p class="small muted">Refunded in full. {REFUND_WHY[o.refund_reason ?? ''] ?? ''} The order is canceled and downloads are closed.</p>
			{:else if o.blocked_at}
				<div class="notice">
					<p class="small"><strong>Your files are temporarily unavailable</strong> because of a copyright notice. Ask for a full refund now, or wait. If they're still blocked on <strong>{o.blockDeadline}</strong>, we start your full refund automatically. If access returns by then and you haven't asked for a refund, your order continues.</p>
					<form method="POST" action="?/blockRefund" use:enhance={() => { busy = true; return async ({ update }) => { await update(); busy = false; }; }}>
						<input type="hidden" name="order_id" value={o.id} />
						<button class="btn primary" disabled={busy}>{busy ? 'Refunding…' : `Refund me now · ${money(o.amount_cents + o.tax_cents)}`}</button>
					</form>
				</div>
				<div class="acts"><a class="btn" href="/purchases/{o.id}/license" target="_blank">Order & license</a></div>
			{:else}
				<div class="acts">
					<a class="btn primary" href="/purchases/{o.id}/download/file">Download beat ({(o.file_format ?? 'audio').toUpperCase()})</a>
					{#if o.includes_stems && o.has_stems}<a class="btn" href="/purchases/{o.id}/download/stems">Download stems (ZIP)</a>{/if}
					<a class="btn" href="/purchases/{o.id}/license" target="_blank">Signed license</a>
				</div>
				{#if o.delivered_at}
					<p class="mono small muted">License active since {day(o.delivered_at)}. Download again any time; keep your own copies too.</p>
				{:else}
					<div class="notice">
						<p class="small"><strong>Reserved for you.</strong> Your exclusive license starts when your first download of the beat or stems finishes. Until then you can cancel for a full refund. Download by <strong>{day(o.expiresAt!)}</strong> or the order is canceled and refunded automatically.</p>
						{#if confirmCancel === o.id}
							<form method="POST" action="?/cancel" class="acts" use:enhance={() => { busy = true; return async ({ update }) => { await update(); busy = false; confirmCancel = null; }; }}>
								<input type="hidden" name="order_id" value={o.id} />
								<button class="btn danger" disabled={busy}>{busy ? 'Canceling…' : `Yes, cancel and refund ${money(o.amount_cents + o.tax_cents)}`}</button>
								<button type="button" class="btn ghost" onclick={() => (confirmCancel = null)}>Keep it</button>
							</form>
						{:else}
							<button type="button" class="btn ghost small-cancel" onclick={() => (confirmCancel = o.id)}>Cancel for a full refund</button>
						{/if}
					</div>
				{/if}
			{/if}
			{#if form?.id === o.id}
				{#if form.error}<p class="error small">{form.error}</p>{:else if form.ok}<p class="success small">{form.ok}</p>{/if}
			{/if}
		</li>
	{/each}
</ul>

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(3rem, 14vw, 5rem); line-height: 0.9; margin: 0 0 20px; }
	.headline span { color: var(--pink); }
	.orders { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
	.order { border: 1.5px solid var(--line-2); border-radius: var(--radius); padding: 14px; display: grid; gap: 10px; }
	.order.hl { border-color: var(--pink); }
	.order p { margin: 0; }
	.top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
	.t { font-size: 1.5rem; text-decoration: none; overflow-wrap: anywhere; }
	.price { font-size: 1.5rem; }
	.acts { display: flex; flex-wrap: wrap; gap: 8px; }
	.acts .btn { min-height: 40px; }
	.wait { color: var(--warn); }
	.notice { display: grid; gap: 10px; padding: 12px 14px; border-left: 4px solid var(--warn); background: var(--ink-2); border-radius: var(--radius); }
	.notice p { line-height: 1.55; }
	.notice strong { color: var(--paper); }
	.small-cancel { justify-self: start; min-height: 36px; }
</style>
