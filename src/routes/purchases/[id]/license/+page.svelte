<script lang="ts">
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>License {data.orderId.slice(0, 8).toUpperCase()} · AuxRiot</title></svelte:head>

<div class="bar noprint">
	<a class="mono small" href="/purchases">← Your purchases</a>
	<button type="button" onclick={() => window.print()}>Save as PDF / print</button>
</div>
{#if data.refunded}<p class="void mono">Void: this order was refunded, so this license no longer grants any rights.</p>{/if}
<LegalDoc source={data.source} />
<p class="mono small muted">License version {data.version} · signed electronically at checkout by both parties.</p>

<style>
	.bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 8px 0 12px; }
	.bar button { min-height: 38px; padding: 4px 14px; }
	.void { border: 2px solid var(--pink); color: var(--pink); padding: 10px 12px; border-radius: var(--radius); }
	@media print {
		:global(header), :global(footer), :global(.betabar), :global(.ballotbar), .noprint { display: none !important; }
		:global(body) { background: #fff !important; color: #000 !important; }
		:global(.legal p), :global(.legal li), :global(.legal strong), :global(.legal h1), :global(.legal h2), :global(.legal td), :global(.legal th) { color: #000 !important; }
	}
</style>
