<script lang="ts">
	import BattleCard from '#lib/components/BattleCard.svelte';
	import type { PageProps } from './$types';

	import { goto } from '$app/navigation';

	let { data }: PageProps = $props();
	let now = $state(Date.now());
	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
	function changeSort(e: Event) {
		const sort = (e.currentTarget as HTMLSelectElement).value;
		goto(`/?tab=${data.tab}&sort=${sort}`, { reset: false });
	}
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

{#if data.promoted.length}
	<section class="promoted" aria-label="Promoted battles">
		<ul class="list">
			{#each data.promoted as b (b.id)}
				<li><BattleCard battle={b} {now} promoted /></li>
			{/each}
		</ul>
	</section>
{/if}

<nav class="tabs" data-sveltekit-noscroll>
	<a href="/?tab=voting" class:active={data.tab === 'voting'}>Live · {c.live}</a>
	<a href="/?tab=open" class:active={data.tab === 'open'}>Open · {c.open}</a>
	<a href="/?tab=results" class:active={data.tab === 'results'}>Results</a>
</nav>

<form class="sortbar" method="GET" action="/">
	<input type="hidden" name="tab" value={data.tab} />
	<label class="mono" for="sort">Sort</label>
	<select id="sort" name="sort" value={data.sort} onchange={changeSort}>
		{#each data.sorts as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
	</select>
	<noscript><button>Go</button></noscript>
</form>

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
			<li><BattleCard battle={b} {now} /></li>
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
	.promoted { margin-bottom: 24px; }
	.sortbar { display: flex; align-items: center; gap: 10px; margin: -4px 0 16px; }
	.sortbar label { margin: 0; color: var(--muted); }
	.sortbar select { width: auto; padding: 8px 12px; font-family: var(--mono); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
	.big { font-size: 2.2rem; margin: 0 0 8px; }
</style>
