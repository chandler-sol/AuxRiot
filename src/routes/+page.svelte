<script lang="ts">
	import BattleCard from '#lib/components/BattleCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let c = $derived(data.counts);
	let tape = $derived([
		`${c.live} live now`,
		`${c.open} need a challenger`,
		`${c.producers} producer${c.producers === 1 ? '' : 's'}`,
		'tonight'
	]);
</script>

<svelte:head><title>AuxRiot · 1v1 beat battles</title></svelte:head>

<section class="hero">
	<p class="mono kicker">No. 001 — 1v1 beat battles — every night</p>
	<h1 class="headline">Drop a beat.<br /><span>Get called out.</span><br />Crowd decides.</h1>
	<p class="sub">First producer to answer takes the slot. Voters have to actually listen.</p>
	{#if !data.user}
		<a class="btn primary" href="/signup">Start battling</a>
	{/if}
</section>

<div class="tape-wrap" aria-hidden="true">
	<div class="tape mono">
		{#each [0, 1] as rep (rep)}
			{#each tape as t, i (i)}<span>{t}</span><span>★</span>{/each}
		{/each}
	</div>
</div>

<nav class="tabs" data-sveltekit-noscroll>
	<a href="/?tab=voting" class:active={data.tab === 'voting'}>Live · {c.live}</a>
	<a href="/?tab=open" class:active={data.tab === 'open'}>Open · {c.open}</a>
	<a href="/?tab=results" class:active={data.tab === 'results'}>Results</a>
</nav>

{#if data.battles.length === 0}
	<div class="empty">
		<p class="display big">
			{#if data.tab === 'open'}No open battles.{:else if data.tab === 'voting'}Nothing live.{:else}No results yet.{/if}
		</p>
		<p class="muted">
			{#if data.tab === 'open'}
				<a href="/battles/new">Drop a beat</a> and wait for someone brave enough to answer.
			{:else if data.tab === 'voting'}
				Answer an <a href="/?tab=open">open battle</a> to kick off a vote.
			{:else}
				Finished battles land here.
			{/if}
		</p>
	</div>
{:else}
	<ul class="list">
		{#each data.battles as b (b.id)}
			<li><BattleCard battle={b} now={data.now} /></li>
		{/each}
	</ul>
{/if}

<style>
	.hero { padding: 16px 0 24px; }
	.kicker { color: var(--muted); margin: 0 0 12px; }
	.headline { font-size: clamp(2.9rem, 13.5vw, 5.2rem); line-height: 0.92; margin-bottom: 14px; }
	.headline span { color: var(--lime); }
	.sub { color: var(--dim); margin: 0 0 18px; max-width: 32em; }
	.tape-wrap { overflow: hidden; margin: 4px -16px 22px; padding: 10px 0; }
	.tape {
		display: flex; gap: 18px; white-space: nowrap; width: max-content;
		background: var(--paper); color: var(--ink); padding: 9px 20px; font-size: 0.75rem;
		transform: rotate(2deg) translateX(-10px);
		animation: scroll 40s linear infinite;
	}
	@keyframes scroll { to { transform: rotate(2deg) translateX(-50%); } }
	@media (prefers-reduced-motion: reduce) { .tape { animation: none; } }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
	.empty { padding: 32px 0; }
	.big { font-size: 2.2rem; margin: 0 0 8px; }
</style>
