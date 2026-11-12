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
		goto(`/battles?tab=${data.tab}&sort=${sort}`, { reset: false });
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
	<div>
		<p class="mono kicker">The feed — live from AuxRiot</p>
		<h1 class="headline">Tonight's <span>card.</span></h1>
	</div>
	<div class="hero-aside">
		<p class="sub">
			Live votes, open challenges and fresh results.
			<a class="how mono" href="/rules">How battles go down →</a>
		</p>
		{#if !data.user}
			<a class="btn primary" href="/signup">Start battling</a>
		{/if}
	</div>
</section>

<div class="tape-wrap" aria-hidden="true">
	<div class="tape mono">
		{#each [0, 1, 2, 3, 4, 5] as rep (rep)}
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

<div class="controls">
<nav class="tabs" data-sveltekit-noscroll>
	<a href="/battles?tab=voting" class:active={data.tab === 'voting'}>Live · {c.live}</a>
	<a href="/battles?tab=open" class:active={data.tab === 'open'}>Open · {c.open}</a>
	<a href="/battles?tab=results" class:active={data.tab === 'results'}>Results</a>
</nav>

<form class="sortbar" method="GET" action="/battles">
	<input type="hidden" name="tab" value={data.tab} />
	<label class="mono" for="sort">Sort</label>
	<select id="sort" name="sort" value={data.sort} onchange={changeSort}>
		{#each data.sorts as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
	</select>
	<noscript><button>Go</button></noscript>
</form>
</div>

{#if data.battles.length === 0}
	<div class="empty">
		<p class="display big">
			{#if data.tab === 'open'}No open battles.{:else if data.tab === 'voting'}Nothing live.{:else}No results yet.{/if}
		</p>
		<p class="muted">
			{#if data.tab === 'open'}
				<a href="/battles/new">Drop a beat</a> and wait for someone brave enough to answer.
			{:else if data.tab === 'voting'}
				Answer an <a href="/battles?tab=open">open battle</a> to kick off a vote.
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
	.headline { font-size: clamp(3rem, 15vw, 5.2rem); line-height: 0.92; margin-bottom: 14px; }
	.headline span { color: var(--pink); }
	.how { display: inline-block; margin-left: 4px; color: var(--paper); text-decoration: none; border-bottom: 1.5px solid var(--pink); }
	.how:hover { color: var(--pink); }
	.sub { color: var(--dim); margin: 0 0 18px; max-width: 32em; }
	.tape-wrap { overflow: hidden; margin: 0 calc(50% - 50vw) 12px; padding: max(12px, 2vw) 0; }
	.tape {
		display: flex; gap: 18px; white-space: nowrap; width: max-content;
		background: var(--paper); color: var(--ink); padding: 9px 20px; font-size: 0.75rem;
		transform-origin: 50vw 50%;
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
	.controls { margin-bottom: 4px; }

	/* Phones: same tightening as the battle page — less air, more battles above the fold. */
	@media (max-width: 719px) {
		.hero { padding: 2px 0 6px; }
		.kicker { margin-bottom: 6px; font-size: 0.66rem; }
		.headline { font-size: clamp(2.4rem, 11.2vw, 3.4rem); margin-bottom: 8px; white-space: nowrap; }
		.sub { margin-bottom: 4px; font-size: 0.95rem; }
		.hero-aside .btn { margin-top: 8px; }
		.tape-wrap { padding: 8px 0; margin-bottom: 8px; }
		.tape { padding: 7px 16px; font-size: 0.66rem; gap: 14px; }
		.promoted { margin-bottom: 14px; }
		.controls :global(.tabs) { margin-bottom: 8px; gap: 6px; }
		.controls :global(.tabs a) { padding: 6px 11px 4px; font-size: 0.98rem; }
		.sortbar { margin: 0 0 12px; }
		.sortbar select { padding: 6px 10px; font-size: 0.68rem; }
		.list { gap: 12px; }
	}
	@media (min-width: 720px) {
		.controls { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
		.controls :global(.tabs), .controls .sortbar { margin: 0; }
	}

	@media (min-width: 720px) {
		.list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
	}
	@media (min-width: 1080px) {
		.list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.promoted .list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; padding-top: 32px; }
		.hero .sub { margin-bottom: 12px; }
		.hero .headline { margin-bottom: 0; }
		.hero-aside { max-width: 380px; text-align: right; }
	}
</style>
