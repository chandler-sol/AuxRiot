<script lang="ts">
	import { timeLeft, ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>AuxRiot · 1v1 beat battles</title></svelte:head>

<section class="hero">
	<h1>Drop a beat. Get challenged. Let the crowd decide.</h1>
	<p class="muted">
		1v1 battles. First producer to answer takes the slot. Voters score drums, melody, mix and overall — and
		have to actually listen first.
	</p>
	{#if !data.user}
		<a class="btn primary" href="/signup">Start battling</a>
	{/if}
</section>

<nav class="tabs" data-sveltekit-noscroll>
	<a href="/?tab=voting" class:active={data.tab === 'voting'}>Voting now</a>
	<a href="/?tab=open" class:active={data.tab === 'open'}>Needs a challenger</a>
	<a href="/?tab=results" class:active={data.tab === 'results'}>Results</a>
</nav>

{#if data.battles.length === 0}
	<div class="card empty muted">
		{#if data.tab === 'open'}
			No open battles right now. <a href="/battles/new">Start one</a> and wait for a challenger.
		{:else if data.tab === 'voting'}
			Nothing's being voted on right now. Check <a href="/?tab=open">open battles</a> — answer one to kick off a vote.
		{:else}
			No finished battles yet.
		{/if}
	</div>
{:else}
	<ul class="list">
		{#each data.battles as b (b.id)}
			<li>
				<a class="card battle" href="/battles/{b.id}" data-sveltekit-preload-data="hover">
					<div class="row spread">
						<span class="pill {b.status}">{b.status === 'open' ? 'open' : b.status === 'voting' ? 'live' : 'final'}</span>
						<span class="muted small">
							{#if b.status === 'voting' && b.voting_ends_at}
								{timeLeft(b.voting_ends_at - data.now)}
							{:else}
								{ago(b.created_at, data.now)}
							{/if}
						</span>
					</div>
					<h3>{b.title}</h3>
					<div class="vs">
						<span class:winner={b.status === 'closed' && b.winner_id === b.creator_id}>{b.creator}</span>
						<span class="muted">vs</span>
						{#if b.challenger}
							<span class:winner={b.status === 'closed' && b.winner_id && b.winner_id !== b.creator_id}>{b.challenger}</span>
						{:else}
							<span class="muted">???</span>
						{/if}
					</div>
					<div class="muted small">
						{#if b.status !== 'open'}{b.votes} vote{b.votes === 1 ? '' : 's'} · {/if}{b.comments} comment{b.comments === 1 ? '' : 's'}
						{#if b.status === 'open'} · {b.vote_hours}h vote{/if}
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.hero { padding: 16px 0 24px; }
	.hero h1 { font-size: clamp(1.5rem, 5vw, 2.2rem); letter-spacing: -0.02em; }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.battle { display: block; color: var(--text); transition: border-color 0.15s; }
	.battle:hover { text-decoration: none; border-color: #44444f; }
	.battle h3 { margin: 8px 0 4px; }
	.vs { display: flex; gap: 8px; font-weight: 600; margin-bottom: 4px; }
	.winner { color: var(--good); }
	.winner::after { content: ' 👑'; }
	.empty { text-align: center; padding: 32px 16px; }
</style>
