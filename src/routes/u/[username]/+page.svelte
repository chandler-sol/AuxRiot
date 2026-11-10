<script lang="ts">
	import BattleCard from '#lib/components/BattleCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let p = $derived(data.profile);
	let decided = $derived(p.wins + p.losses);
	let winRate = $derived(decided ? Math.round((p.wins / decided) * 100) : null);
</script>

<svelte:head><title>{p.username} · AuxRiot</title></svelte:head>

<section class="head">
	<p class="mono muted">Producer — joined {new Date(p.created_at).toLocaleDateString()}</p>
	<h1 class="name">{p.username}</h1>
	<div class="ticket">
		<div><span class="display v">{p.wins}</span><span class="mono l">Wins</span></div>
		<div><span class="display v">{p.losses}</span><span class="mono l">Losses</span></div>
		<div><span class="display v">{p.ties}</span><span class="mono l">Ties</span></div>
		<div><span class="display v">{winRate === null ? '—' : winRate + '%'}</span><span class="mono l">Win rate</span></div>
	</div>
</section>

<h2>Battles</h2>
{#if data.battles.length === 0}
	<p class="muted">No battles yet.</p>
{:else}
	<ul class="list">
		{#each data.battles as b (b.id)}
			<li><BattleCard battle={b} now={data.now} /></li>
		{/each}
	</ul>
{/if}

<style>
	.head { padding: 8px 0 24px; }
	.head p { margin: 0 0 8px; }
	.name { font-size: clamp(3rem, 16vw, 5.5rem); line-height: 0.9; color: var(--pink); overflow-wrap: anywhere; }
	.ticket {
		display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
		background: var(--paper); color: var(--ink); border-radius: var(--radius); padding: 12px 8px 10px; text-align: center;
	}
	.ticket div { display: flex; flex-direction: column; }
	.v { font-size: 2rem; line-height: 1; }
	.l { color: #5a544b; font-size: 0.6rem; margin-top: 4px; }
	.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
</style>
