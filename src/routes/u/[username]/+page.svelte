<script lang="ts">
	import { ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let p = $derived(data.profile);
	let decided = $derived(p.wins + p.losses);
	let winRate = $derived(decided ? Math.round((p.wins / decided) * 100) : null);
</script>

<svelte:head><title>{p.username} · AuxRiot</title></svelte:head>

<section class="card stack">
	<h1>{p.username}</h1>
	<p class="muted small">Joined {new Date(p.created_at).toLocaleDateString()}</p>
	<div class="stats">
		<div><strong>{p.wins}</strong><span>Wins</span></div>
		<div><strong>{p.losses}</strong><span>Losses</span></div>
		<div><strong>{p.ties}</strong><span>Ties</span></div>
		<div><strong>{winRate === null ? '—' : winRate + '%'}</strong><span>Win rate</span></div>
	</div>
</section>

<h2 class="section">Battles</h2>
{#if data.battles.length === 0}
	<p class="muted">No battles yet.</p>
{:else}
	<ul class="list">
		{#each data.battles as b (b.id)}
			<li>
				<a class="card item" href="/battles/{b.id}">
					<div class="row spread">
						<strong>{b.title}</strong>
						{#if b.status === 'closed'}
							<span class="pill" class:closed={b.winner_id === p.id}>
								{b.winner_id === null ? 'tie' : b.winner_id === p.id ? 'won' : 'lost'}
							</span>
						{:else}
							<span class="pill {b.status}">{b.status}</span>
						{/if}
					</div>
					<div class="muted small">{b.creator} vs {b.challenger ?? '???'} · {ago(b.created_at)}</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; }
	.stats strong { display: block; font-size: 1.5rem; }
	.stats span { font-size: 0.8rem; color: var(--muted); }
	.section { margin-top: 24px; }
	.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
	.item { display: block; color: var(--text); }
	.item:hover { text-decoration: none; border-color: #44444f; }
</style>
