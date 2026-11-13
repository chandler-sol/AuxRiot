<script lang="ts">
	import { goto } from '$app/navigation';
	import StoreCard from '#lib/components/StoreCard.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { money } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const f = $derived(data.filters);
	let showFilters = $state(false);

	function nav(e: Event) {
		const form = (e.currentTarget as HTMLElement).closest('form') as HTMLFormElement;
		const p = new URLSearchParams();
		for (const [k, v] of new FormData(form)) if (v && !(k === 'sort' && v === 'newest')) p.set(k, String(v));
		goto(`/store${p.size ? `?${p}` : ''}`, { reset: false });
	}
	const active = $derived([f.genre, f.key, f.bpmMin, f.bpmMax, f.maxPrice, f.stemsOnly].filter(Boolean).length);
</script>

<svelte:head><title>Beat store · AuxRiot</title></svelte:head>

<section class="hero">
	<p class="mono kicker">The store — exclusives only</p>
	<h1 class="headline">Beats that <span>battled.</span></h1>
	<p class="sub">One buyer per beat. When it sells, it's gone — and the battle gets a SOLD stamp.</p>
	<p class="mono small links"><a href="/store/terms">Store Terms</a> · <a href="/store/license">Exclusive Beat License</a></p>
</section>

<div class="layout">
	<div class="main">
		<form class="filters" method="GET" action="/store" onsubmit={(e) => { e.preventDefault(); nav(e); }}>
			<div class="row">
				<input name="q" type="search" placeholder="Search beats or producers" value={f.q} onchange={nav} />
				<select name="sort" value={f.sort} onchange={nav} aria-label="Sort">
					<option value="newest">Newest</option>
					<option value="winners">Battle winners first</option>
					<option value="price_low">Price: low to high</option>
					<option value="price_high">Price: high to low</option>
				</select>
				<button type="button" class="ftoggle" onclick={() => (showFilters = !showFilters)}>Filters{active ? ` · ${active}` : ''}</button>
			</div>
			<div class="more" class:open={showFilters || active > 0}>
				<select name="genre" value={f.genre} onchange={nav} aria-label="Genre">
					<option value="">Any genre</option>
					{#each data.options.genres as g (g)}<option value={g}>{g}</option>{/each}
				</select>
				<select name="key" value={f.key} onchange={nav} aria-label="Key">
					<option value="">Any key</option>
					{#each data.options.keys as k (k)}<option value={k}>{k}</option>{/each}
				</select>
				<input name="bpm_min" type="text" inputmode="numeric" placeholder="BPM from" value={f.bpmMin || ''} onchange={nav} />
				<input name="bpm_max" type="text" inputmode="numeric" placeholder="BPM to" value={f.bpmMax || ''} onchange={nav} />
				<input name="max" type="text" inputmode="decimal" placeholder="Max $" value={f.maxPrice || ''} onchange={nav} />
				<label class="check"><input type="checkbox" name="stems" value="1" checked={f.stemsOnly} onchange={nav} /> Stems available</label>
			</div>
		</form>

		{#if data.items.length}
			<ul class="grid">
				{#each data.items as item (item.id)}<li><StoreCard {item} /></li>{/each}
			</ul>
		{:else}
			<div class="empty">
				<p class="display big">{active || f.q ? 'Nothing matches.' : 'Store opens soon.'}</p>
				<p class="muted">Producers can list any beat they've battled with — open your battle and hit <strong>Sell this beat</strong>.</p>
			</div>
		{/if}
	</div>

	{#if data.sellers.length}
		<aside class="sellers">
			<h2>Producers selling</h2>
			<ul>
				{#each data.sellers as s (s.username)}
					<li>
						<a href="/u/{s.username}#store">
							<Avatar username={s.username} avatarKey={s.avatar_key} color={s.color} size={36} />
							<span class="stext">
								<span class="sname display">{s.username}</span>
								<span class="mono small muted">{s.n} beat{s.n === 1 ? '' : 's'} · from {money(s.from_cents)}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</aside>
	{/if}
</div>

<style>
	.hero { padding: 4px 0 14px; }
	.kicker { color: var(--muted); margin: 0 0 8px; font-size: 0.66rem; }
	.headline { font-size: clamp(2.4rem, 11vw, 5rem); line-height: 0.92; margin: 0 0 8px; }
	.headline span { color: var(--pink); }
	.sub { color: var(--dim); margin: 0; }
	.links { margin: 8px 0 0; }
	.links a { color: var(--dim); }
	.layout { display: grid; gap: 22px; }
	@media (min-width: 1000px) { .layout { grid-template-columns: 1fr 280px; align-items: start; } }
	.filters { display: grid; gap: 8px; margin-bottom: 14px; }
	.filters .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
	.filters .row input { grid-column: 1 / -1; }
	@media (min-width: 640px) { .filters .row { grid-template-columns: 1fr auto auto; } .filters .row input { grid-column: auto; } }
	.ftoggle { white-space: nowrap; }
	.more { display: none; grid-template-columns: 1fr 1fr; gap: 8px; }
	.more.open { display: grid; }
	@media (min-width: 640px) { .more { grid-template-columns: repeat(3, 1fr); } }
	.check { display: flex; gap: 8px; align-items: center; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-size: 0.9rem; color: var(--paper); font-weight: 400; }
	.check input { width: 20px; height: 20px; accent-color: var(--pink); }
	.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
	@media (min-width: 720px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
	.empty { padding: 30px 0; }
	.big { font-size: 2.2rem; margin: 0 0 8px; }
	.sellers h2 { font-size: 1.5rem; margin: 0 0 10px; }
	.sellers ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
	.sellers a { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: var(--radius); text-decoration: none; color: var(--paper); }
	.sellers a:hover { background: var(--ink-2); }
	.stext { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
	.sname { font-size: 1.15rem; line-height: 1; overflow-wrap: anywhere; }
	.stext .mono { white-space: nowrap; }
</style>
