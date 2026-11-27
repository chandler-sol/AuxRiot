<script lang="ts">
	import { money2 } from '#lib/store.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const label = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
	const signed = (c: number) => (c < 0 ? `−${money2(-c)}` : money2(c));
	const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

	function csv(m: (typeof data.months)[number]) {
		const head = ['order', 'date', 'beat', 'package', 'list price', 'discount', 'sale', 'tax (collected by AuxRiot)', 'AuxRiot fee', 'card processing', 'net', 'status', 'refund adjustment'];
		const rows = m.lines.map((l) => [l.id.toUpperCase(), new Date(l.paidAt).toISOString().slice(0, 10), l.title, l.stems ? 'Exclusive + Stems' : 'Exclusive', l.price / 100, l.discount / 100, l.sale / 100, l.tax / 100, l.fee / 100, l.processing / 100, l.net / 100, l.status, l.adjustment / 100]);
		const text = [head, ...rows].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n');
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
		a.download = `auxriot-statement-${m.month}.csv`;
		a.click();
	}
</script>

<svelte:head><title>Statements · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/settings/payouts">← Payouts</a></p>
<h1 class="headline">State<span>ments.</span></h1>
<p class="muted small lede">Your sales by month: gross sales and number of sales, with tax, AuxRiot's fee, card processing, discounts and refund adjustments shown separately from your net. Tax is collected and remitted by AuxRiot, not part of your proceeds. Payout timing is in your Stripe dashboard.</p>

{#each data.months as m (m.month)}
	<section class="month">
		<div class="mhead">
			<h2 class="display">{label(m.month)}</h2>
			<button type="button" class="small-btn ghost" onclick={() => csv(m)}>Download CSV</button>
		</div>
		<dl class="sum">
			<dt>Sales</dt><dd>{m.sales}{m.refunds ? ` (${m.refunds} refunded)` : ''}</dd>
			<dt>Gross sales</dt><dd>{money2(m.gross)}</dd>
			{#if m.discounts}<dt>Discounts</dt><dd>−{money2(m.discounts)}</dd>{/if}
			<dt>Tax collected by AuxRiot</dt><dd>{money2(m.tax)}</dd>
			<dt>AuxRiot fee</dt><dd>−{money2(m.fees)}</dd>
			<dt>Card processing</dt><dd>−{money2(m.processing)}</dd>
			<dt>Net from sales</dt><dd>{money2(m.net)}</dd>
			{#if m.refunds}<dt>Refund adjustments</dt><dd>{signed(m.refundAdj)}</dd>{/if}
			<dt class="tot">Net after adjustments</dt><dd class="tot">{signed(m.net + m.refundAdj)}</dd>
		</dl>
		<ul class="lines">
			{#each m.lines as l (l.id)}
				<li>
					<span class="lt">{day(l.paidAt)} · "{l.title}"{l.stems ? ' + stems' : ''}</span>
					<span class="mono small muted">{l.id.slice(0, 8).toUpperCase()} · sale {money2(l.sale)} · fee {money2(l.fee)} · card {money2(l.processing)} · net {money2(l.net)}{l.status === 'refunded' ? ` · refunded (${(l.refundReason ?? '').replaceAll('_', ' ')}) ${signed(l.adjustment)}` : ''}</span>
				</li>
			{/each}
		</ul>
	</section>
{:else}
	<p class="muted">No sales yet.</p>
{/each}

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(3rem, 14vw, 5rem); line-height: 0.9; margin: 0; }
	.headline span { color: var(--pink); }
	.lede { margin: 10px 0 20px; line-height: 1.55; }
	.month { background: var(--ink-2); border-radius: var(--radius); padding: 14px; margin-bottom: 12px; display: grid; gap: 10px; }
	.mhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
	.mhead h2 { margin: 0; font-size: 1.5rem; }
	.sum { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 4px 14px; font-size: 0.92rem; }
	.sum dt { color: var(--dim); }
	.sum dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
	.sum .tot { color: var(--paper); font-weight: 700; border-top: 1.5px dashed var(--line-2); padding-top: 6px; }
	.lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 10px; }
	.lines li { display: grid; gap: 2px; overflow-wrap: anywhere; }
	.lt { font-size: 0.92rem; }
</style>
