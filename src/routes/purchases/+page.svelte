<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { money } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
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
				<p class="mono small muted">Refunded. The license is void and downloads are closed.</p>
			{:else if o.canDownload}
				<div class="acts">
					<a class="btn primary" href="/purchases/{o.id}/download/file">Download beat ({(o.file_format ?? 'audio').toUpperCase()})</a>
					{#if o.includes_stems && o.has_stems}<a class="btn" href="/purchases/{o.id}/download/stems">Download stems (ZIP)</a>{/if}
					<a class="btn" href="/purchases/{o.id}/license" target="_blank">Signed license</a>
				</div>
				<p class="mono small muted">
					Downloads open until {day(o.openUntil!)}.
					{#if o.first_download_at}Downloaded {o.download_count}× — the sale is final.{:else}Your first download makes the sale final (refunds are available until then).{/if}
				</p>
			{:else}
				<div class="acts"><a class="btn" href="/purchases/{o.id}/license" target="_blank">Signed license</a></div>
				<p class="mono small muted">The 7-day download window has closed. Lost your files? Email hello@auxriot.com with your order number.</p>
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
</style>
