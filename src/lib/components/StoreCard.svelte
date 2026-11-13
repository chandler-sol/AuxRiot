<script lang="ts">
	import Player from '#lib/components/Player.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { money } from '#lib/store.ts';
	import type { StoreItem } from '#lib/server/storequery.ts';

	let { item, showSeller = true }: { item: StoreItem; showSeller?: boolean } = $props();
	const sold = $derived(item.status === 'sold');
	const meta = $derived([item.bpm ? `${item.bpm} BPM` : '', item.musicKey ?? '', item.genre ?? ''].filter(Boolean));
</script>

<article class="item" class:sold style:--c={item.color}>
	{#if sold}<span class="stamp display">Sold</span>{/if}
	<div class="top">
		{#if showSeller}
			<a class="seller mono" href="/u/{item.seller.username}#store">
				<Avatar username={item.seller.username} avatarKey={item.seller.avatarKey} color={item.seller.color} size={26} />@{item.seller.username}
			</a>
		{/if}
		{#if item.won}<span class="won mono">★ Battle winner</span>{/if}
	</div>
	<a class="title display" href="/battles/{item.battleId}">{item.title}</a>
	{#if meta.length || item.moods.length}
		<p class="meta mono">{meta.join(' · ')}{#if item.moods.length}<span class="moods">{meta.length ? ' · ' : ''}{item.moods.join(' / ')}</span>{/if}</p>
	{/if}
	<Player variant="compact" src={item.preview.src} peaks={item.preview.peaks} durationMs={item.preview.durationMs} name="Preview" accent={item.color} previewSeconds={30} />
	<div class="buy">
		<div class="prices">
			<span class="price display">{money(item.priceCents)}</span>
			<span class="mono small muted nowrap">Exclusive {item.format?.toUpperCase() ?? ''}{item.tagged ? ' · tagged' : ''}</span>
			{#if item.hasStems}<span class="mono small">+ Stems {money(item.stemsPriceCents)}</span>{/if}
		</div>
		{#if sold}
			<span class="mono small muted">Off the market</span>
		{:else if !item.buyOpen}
			<a class="btn locked" href="/battles/{item.battleId}">Battle live — buy after</a>
		{:else}
			<a class="btn primary" href="/battles/{item.battleId}#buy">Buy</a>
		{/if}
	</div>
	{#if !sold}<a class="ask mono" href="/messages/new?listing={item.id}">✉ Ask @{item.seller.username}</a>{/if}
</article>

<style>
	.item { position: relative; background: var(--ink-2); border-radius: var(--radius); border-left: 6px solid var(--c); padding: 14px; display: grid; gap: 8px; overflow: hidden; }
	.item.sold { opacity: 0.75; }
	.stamp { position: absolute; top: 12px; right: -34px; transform: rotate(18deg); background: var(--pink); color: var(--ink); padding: 4px 44px; font-size: 1.2rem; letter-spacing: 0.08em; }
	.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 26px; }
	.seller { display: inline-flex; align-items: center; gap: 8px; color: var(--paper); text-decoration: none; }
	.seller:hover { color: var(--pink); }
	.won { color: var(--warn); font-size: 0.62rem; }
	.title { font-size: 1.6rem; line-height: 1; color: var(--paper); text-decoration: none; overflow-wrap: anywhere; }
	.title:hover { color: var(--c); }
	.meta { margin: 0; color: var(--dim); font-weight: 400; font-size: 0.66rem; }
	.moods { color: var(--muted); }
	.buy { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; border-top: 1.5px dashed var(--line-2); padding-top: 10px; }
	.prices { display: flex; flex-direction: column; gap: 2px; }
	.price { font-size: 1.9rem; line-height: 1; color: var(--paper); }
	.btn { min-height: 42px; padding: 2px 16px 0; font-size: 1.05rem; white-space: nowrap; }
	.locked { color: var(--dim); font-size: 0.85rem; }
	.nowrap { white-space: nowrap; }
	.ask { color: var(--dim); text-decoration: none; font-size: 0.66rem; justify-self: start; }
	.ask:hover { color: var(--paper); }
</style>
