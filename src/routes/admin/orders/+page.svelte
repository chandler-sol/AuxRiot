<script lang="ts">
	import { enhance } from '$app/forms';
	import { money } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let openRefund = $state<string | null>(null);
	let busy = $state(false);
	const TABS = ['paid', 'refunded', 'disputed', 'pending', 'all'];
	const REASONS: [string, string][] = [
		['buyer_request', 'Buyer asked (before download)'],
		['defect', 'File defective / not as described'],
		['copyright', 'Copyright removal (beat comes off the store)'],
		['other', 'Other']
	];
	const when = (t: number | null) => (t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
</script>

<svelte:head><title>Orders · Admin</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Admin</a> — Orders{#if data.mode === 'test'} · <span class="test">Stripe test mode</span>{/if}</p>
<h1 class="headline">Order <span>desk.</span></h1>
<p class="muted totals">
	{data.totals?.n ?? 0} paid · {money(data.totals?.gross ?? 0)} sales · {money(data.totals?.fees ?? 0)} AuxRiot fees · {money(data.totals?.net ?? 0)} to producers
</p>

<nav class="tabs">
	{#each TABS as t (t)}<a href="/admin/orders?status={t}" class:active={data.status === t}>{t}</a>{/each}
</nav>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}

<ul class="list">
	{#each data.orders as o (o.id)}
		<li class="order">
			<div class="top">
				<div class="what">
					<a class="display t" href="/battles/{o.battle_id}#buy">{o.title}</a>
					<p class="mono small muted">{o.id.slice(0, 8).toUpperCase()} · @{o.buyer} bought from @{o.seller}{o.includes_stems ? ' · with stems' : ''}</p>
				</div>
				<span class="mono tag st-{o.status}">{o.status}</span>
			</div>
			<p class="mono small split">
				{money(o.amount_cents)}{o.tax_cents ? ` + ${money(o.tax_cents)} tax` : ''} · fee {money(o.platform_fee_cents)} · card {money(o.processing_fee_cents)} · producer {money(o.seller_net_cents)}
			</p>
			<p class="mono small muted">
				Paid {when(o.paid_at)} ·
				{#if o.first_download_at}downloaded {o.download_count}× (final){:else}not downloaded yet{/if}
				{#if o.refunded_at} · refunded {when(o.refunded_at)} ({o.refund_reason?.replace('_', ' ')}){/if}
				{#if o.disputed_at} · <span class="bad">chargeback: {o.dispute_status?.replace('_', ' ')}</span>{/if}
			</p>
			{#if o.status === 'paid'}
				{#if openRefund === o.id}
					<form
						method="POST"
						action="?/refund"
						class="refund"
						use:enhance={() => {
							busy = true;
							return async ({ result, update }) => {
								await update({ reset: false });
								busy = false;
								if (result.type === 'success') openRefund = null;
							};
						}}
					>
						<input type="hidden" name="order_id" value={o.id} />
						<p class="small">Full refund of {money(o.amount_cents + o.tax_cents)} to {o.buyer_legal_name ?? `@${o.buyer}`}. The producer's {money(o.seller_net_cents)} is pulled back and AuxRiot's fee is returned.</p>
						<fieldset>
							{#each REASONS as [v, label], i (v)}
								<label class="opt"><input type="radio" name="reason" value={v} checked={i === (o.first_download_at ? 1 : 0)} /> {label}</label>
							{/each}
						</fieldset>
						<label class="opt"><input type="checkbox" name="relist" checked={!o.first_download_at} /> Put the beat back on the store (not for copyright removals)</label>
						{#if o.first_download_at}<label class="opt warn"><input type="checkbox" name="override" /> They downloaded it: refund anyway (law, goodwill)</label>{/if}
						{#if form?.error && form.id === o.id}<p class="error small">{form.error}</p>{/if}
						<div class="row">
							<button class="small-btn danger" disabled={busy}>{busy ? 'Refunding…' : 'Refund in full'}</button>
							<button type="button" class="small-btn ghost" onclick={() => (openRefund = null)}>Cancel</button>
						</div>
					</form>
				{:else}
					<div class="row">
						<button type="button" class="small-btn" onclick={() => (openRefund = o.id)}>Refund…</button>
						<a class="small-btn" href="/purchases/{o.id}/license" target="_blank">License</a>
					</div>
				{/if}
			{/if}
		</li>
	{:else}
		<li class="muted">No orders here yet.</li>
	{/each}
</ul>

<p class="mono small muted foot">Chargebacks: respond in your Stripe dashboard under Payments → Disputes. AuxRiot pulls the producer's share back while a dispute is open and pays it again if you win.</p>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.test { color: var(--warn); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; margin: 0; }
	.headline span { color: var(--pink); }
	.totals { margin: 10px 0 14px; }
	.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
	.tabs a { font-family: var(--mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 10px; border: 1.5px solid var(--line-2); border-radius: var(--radius); text-decoration: none; color: var(--dim); }
	.tabs a.active { background: var(--paper); color: var(--ink); border-color: var(--paper); }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.order { background: var(--ink-2); border-radius: var(--radius); padding: 14px; display: grid; gap: 6px; min-width: 0; }
	.order p { margin: 0; }
	.top { display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; min-width: 0; }
	.what { min-width: 0; }
	.t { font-size: 1.3rem; text-decoration: none; overflow-wrap: anywhere; }
	.tag { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 6px; border: 1.5px solid var(--line-2); border-radius: 2px; white-space: nowrap; }
	.st-paid { border-color: #7dff9b; color: #7dff9b; }
	.st-refunded { border-color: var(--pink); color: var(--pink); }
	.split { color: var(--paper); overflow-wrap: anywhere; }
	.bad { color: var(--pink); }
	.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
	.refund { border-top: 1.5px dashed var(--line-2); padding-top: 10px; display: grid; gap: 8px; }
	.refund fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
	.opt { display: flex; gap: 8px; align-items: flex-start; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--dim); font-size: 0.92rem; }
	.opt input { width: 18px; height: 18px; accent-color: var(--pink); flex: none; margin-top: 2px; }
	.opt.warn { color: var(--warn); }
	.foot { margin-top: 18px; }
</style>
