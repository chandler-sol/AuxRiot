<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let picked = $state<string[]>([]);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
		await update({ reset: false });
		picked = [];
	};
	const qs = $derived.by(() => {
		const p = new URLSearchParams();
		if (data.q) p.set('q', data.q);
		if (data.user) p.set('user', data.user);
		if (data.battle) p.set('battle', data.battle);
		if (data.status !== 'all') p.set('status', data.status);
		return p.toString();
	});
	const act = (name: string) => `?${qs ? qs + '&' : ''}/${name}`;
	function nav(e: Event) {
		const f = (e.currentTarget as HTMLElement).closest('form') as HTMLFormElement;
		const p = new URLSearchParams();
		for (const [k, v] of new FormData(f)) if (v) p.set(k, String(v));
		goto(`/admin/comments?${p}`, { reset: false });
	}
	const toggleAll = () => (picked = picked.length === data.comments.length ? [] : data.comments.map((c) => c.id));
</script>

<svelte:head><title>Comments · AuxRiot mod</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Mod tools</a> — Comments</p>
<h1 class="headline">Comments{#if data.heldCount}<span> · {data.heldCount} held</span>{/if}</h1>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

<details class="words">
	<summary class="display">Blocked words ({data.words.length})</summary>
	<form method="POST" action={act('words')} class="stack" use:enhance={keep}>
		<p class="small muted">
			New comments containing any of these are <strong>held</strong>: the author still sees theirs, nobody else does until a mod
			approves it. Matches whole words, ignores case, and catches simple swaps like <span class="mono">@ → a</span>,
			<span class="mono">3 → e</span>, <span class="mono">0 → o</span>, <span class="mono">$ → s</span>. One per line (phrases are fine).
		</p>
		<textarea name="words" rows="8" placeholder="one word or phrase per line">{data.words.join('\n')}</textarea>
		<div><button class="primary">Save list</button></div>
	</form>
</details>

<form class="filters" method="GET" action="/admin/comments">
	<input name="q" type="search" placeholder="Search comment text" value={data.q} onchange={nav} />
	<input name="user" type="search" placeholder="By username" value={data.user} onchange={nav} />
	<input name="battle" type="search" placeholder="Battle link or ID" value={data.battle} onchange={nav} />
	<select name="status" value={data.status} onchange={nav} aria-label="Status">
		<option value="all">All</option>
		<option value="held">Held for review</option>
		<option value="visible">Visible</option>
		<option value="hidden">Hidden</option>
	</select>
	<noscript><button>Go</button></noscript>
</form>

<form id="bulk" method="POST" action={act('set')} use:enhance={keep}>
	<div class="bulk mono">
		<label class="check"><input type="checkbox" checked={picked.length > 0 && picked.length === data.comments.length} onchange={toggleAll} /> {picked.length ? `${picked.length} picked` : `${data.comments.length} shown`}</label>
		{#if picked.length}
			<button name="op" value="hide">Hide</button>
			<button name="op" value="approve">Approve</button>
			<button name="op" value="unhide">Unhide</button>
		{/if}
	</div>
</form>

<ul class="list">
	{#each data.comments as c (c.id)}
		<li class:hidden={c.hidden} class:held={c.held && !c.hidden}>
			<div class="top">
				<input type="checkbox" name="id" form="bulk" value={c.id} bind:group={picked} aria-label="Pick comment by {c.username}" />
				<div class="who">
					<a class="mono" href="/admin/users?q={encodeURIComponent(c.username)}">@{c.username}</a>
					<span class="mono muted">on <a href="/battles/{c.battle_id}">{c.creator} vs {c.challenger ?? '???'}</a> · {ago(c.created_at, data.now)}</span>
				</div>
			</div>
			<p class="body">{c.body}</p>
			<div class="tags mono">
				{#if c.hidden}<span class="tag">Hidden</span>{/if}
				{#if c.held && !c.hidden}<span class="tag warn">Held{c.matched ? ` · "${c.matched}"` : ''}</span>{/if}
				{#if c.reports}<span class="tag bad">{c.reports} open report{c.reports === 1 ? '' : 's'}</span>{/if}
				{#if c.shadowbanned}<span class="tag bad">Author shadowbanned</span>{/if}
				{#if c.suspended_at}<span class="tag bad">Author suspended</span>{/if}
			</div>
			<form method="POST" action={act('set')} class="row acts" use:enhance={keep}>
				<input type="hidden" name="id" value={c.id} />
				{#if c.held && !c.hidden}<button name="op" value="approve" class="primary">Approve</button>{/if}
				{#if !c.hidden}<button name="op" value="hide">Hide</button>{:else}<button name="op" value="unhide">Unhide</button>{/if}
				<a class="mono small" href="/admin/comments?user={encodeURIComponent(c.username)}">All by {c.username}</a>
			</form>
		</li>
	{:else}
		<li class="muted">No comments match.</li>
	{/each}
</ul>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.6rem, 11vw, 4.2rem); line-height: 0.9; margin-bottom: 12px; }
	.headline span { color: var(--warn); }
	.words { background: var(--ink-2); border: 1.5px dashed var(--line-2); border-radius: var(--radius); padding: 12px 16px; margin: 0 0 14px; }
	.words summary { cursor: pointer; font-size: 1.4rem; list-style: none; }
	.words summary::-webkit-details-marker { display: none; }
	.words summary::after { content: ' +'; color: var(--pink); }
	.words[open] summary::after { content: ' −'; }
	.words form { margin-top: 10px; }
	.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.filters input[name='q'] { grid-column: 1 / -1; }
	@media (min-width: 760px) { .filters { grid-template-columns: 2fr 1fr 1fr auto; } .filters input[name='q'] { grid-column: auto; } }
	.bulk { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0 8px; min-height: 40px; }
	.bulk button { min-height: 36px; padding: 0 12px; font-size: 0.9rem; }
	.check { display: flex; gap: 8px; align-items: center; margin: 0; cursor: pointer; }
	input[type='checkbox'] { width: 20px; height: 20px; accent-color: var(--pink); flex: none; }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
	.list li { background: var(--ink-2); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 8px; border-left: 4px solid transparent; }
	.list li.held { border-left-color: var(--warn); }
	.list li.hidden { opacity: 0.6; }
	.top { display: flex; gap: 10px; align-items: flex-start; }
	.who { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 0.72rem; }
	.who a { color: var(--paper); }
	.who .muted a { color: var(--dim); }
	.body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
	.tags { display: flex; flex-wrap: wrap; gap: 6px; }
	.tags:empty { display: none; }
	.tag { border: 1px solid var(--line-2); border-radius: var(--radius); padding: 3px 8px 2px; color: var(--dim); font-size: 0.6rem; }
	.tag.warn { border-color: var(--warn); color: var(--warn); }
	.tag.bad { border-color: #ff5a4e; color: #ff5a4e; }
	.acts { align-items: center; }
	.acts button { min-height: 36px; padding: 0 12px; font-size: 0.9rem; }
	.acts a { color: var(--dim); margin-left: auto; }
</style>
