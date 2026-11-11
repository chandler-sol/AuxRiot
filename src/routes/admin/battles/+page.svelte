<script lang="ts">
	import { goto } from '$app/navigation';
	import { ago, timeLeft } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	function nav(e: Event) {
		const f = (e.currentTarget as HTMLElement).closest('form') as HTMLFormElement;
		const p = new URLSearchParams(new FormData(f) as unknown as Record<string, string>);
		goto(`/admin/battles?${p}`, { reset: false });
	}
	const LABEL: Record<string, string> = { voting: 'Live', open: 'Open', closed: 'Final', removed: 'Removed', expired: 'Expired' };
</script>

<svelte:head><title>Battles · AuxRiot mod</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Mod tools</a> — Battles</p>
<h1 class="headline">Battles</h1>

<form class="filters" method="GET" action="/admin/battles">
	<input name="q" type="search" placeholder="Title, producer or battle link" value={data.q} onchange={nav} />
	<select name="status" value={data.status} onchange={nav} aria-label="Status">
		<option value="voting">Live votes</option>
		<option value="open">Open (no challenger)</option>
		<option value="closed">Finished</option>
		<option value="removed">Removed</option>
		<option value="expired">Expired</option>
		<option value="all">All</option>
	</select>
	<select name="sort" value={data.sort} onchange={nav} aria-label="Sort">
		<option value="ending">Ending soonest</option>
		<option value="newest">Newest</option>
		<option value="flagged">Most flagged votes</option>
		<option value="reports">Most open reports</option>
		<option value="votes">Most votes</option>
	</select>
	<noscript><button>Go</button></noscript>
</form>

<ul class="list">
	{#each data.battles as b (b.id)}
		<li>
			<a class="row-link" href="/admin/battles/{b.id}">
				<span class="sw" style="background:linear-gradient(90deg,{b.color_a ?? '#ff2e88'} 50%,{b.color_b ?? '#f3ece0'} 50%)"></span>
				<span class="main">
					<span class="display name">{b.creator} <span class="vs">vs</span> {b.challenger ?? '???'}</span>
					<span class="small muted title">"{b.title}"</span>
				</span>
				<span class="mono side">
					<span class="st st-{b.status}">{LABEL[b.status] ?? b.status}</span>
					{#if b.status === 'voting' && b.voting_ends_at}<span>{timeLeft(b.voting_ends_at - data.now)}</span>{:else}<span>{ago(b.created_at, data.now)}</span>{/if}
				</span>
			</a>
			<div class="mono stats">
				<span>{b.votes} vote{b.votes === 1 ? '' : 's'}</span>
				{#if b.flagged}<span class="bad">{b.flagged} discounted</span>{/if}
				<span>{b.comments} comment{b.comments === 1 ? '' : 's'}</span>
				{#if b.reports}<span class="bad">{b.reports} open report{b.reports === 1 ? '' : 's'}</span>{/if}
			</div>
		</li>
	{:else}
		<li class="muted">No battles match.</li>
	{/each}
</ul>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; margin-bottom: 14px; }
	.filters { display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 14px; }
	@media (min-width: 640px) { .filters { grid-template-columns: 1fr auto auto; } }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
	.list li { background: var(--ink-2); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 8px; }
	.row-link { display: flex; gap: 12px; align-items: center; color: var(--paper); text-decoration: none; }
	.row-link:hover .name { color: var(--pink); }
	.sw { flex: none; width: 10px; align-self: stretch; border-radius: 2px; }
	.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.name { font-size: 1.35rem; line-height: 1.05; overflow-wrap: anywhere; }
	.vs { color: var(--dim); font-size: 0.9rem; }
	.title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; color: var(--dim); font-size: 0.62rem; white-space: nowrap; }
	.st { border: 1px solid var(--line-2); border-radius: var(--radius); padding: 2px 7px 1px; }
	.st-voting { border-color: var(--pink); color: var(--pink); }
	.st-removed { border-color: #ff5a4e; color: #ff5a4e; }
	.stats { display: flex; gap: 6px 14px; flex-wrap: wrap; color: var(--dim); font-weight: 400; font-size: 0.66rem; }
	.bad { color: #ff5a4e; }
</style>
