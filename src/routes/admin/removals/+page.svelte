<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const left = (due: number) => {
		const h = (due - data.now) / 3_600_000;
		return h <= 0 ? `OVERDUE by ${Math.ceil(-h)}h` : h < 1 ? `${Math.ceil(h * 60)} min left` : `${Math.floor(h)}h left`;
	};
	const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

<svelte:head><title>Private image removals · Admin</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Admin</a> — Safety</p>
<h1 class="headline">Image <span>removals.</span></h1>
<p class="muted small">Terms §7A: remove a valid request's depiction within 48 hours of receipt, plus known identical copies. Hide the content (comment, avatar, battle) with the usual moderation tools, then mark it here and contact the requester. Never ask them for a copy of the image.</p>

<nav class="tabs">
	<a href="/admin/removals" class:active={data.status === 'open'}>Open</a>
	<a href="/admin/removals?status=done" class:active={data.status === 'done'}>Closed</a>
</nav>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}

<ul class="list">
	{#each data.requests as r (r.id)}
		<li class="req" class:late={r.status === 'open' && r.due_at < data.now}>
			<p class="mono small">{r.status === 'open' ? left(r.due_at) : `${r.status} ${r.resolved_at ? when(r.resolved_at) : ''} by ${r.resolved_by ?? '—'}`} · received {when(r.created_at)}{r.on_behalf ? ' · representative' : ''}</p>
			<p><strong>Where:</strong> {r.location}</p>
			<p><strong>Details:</strong> {r.details}</p>
			<p class="small"><strong>Contact:</strong> {r.contact} · <strong>Signed:</strong> {r.signature}</p>
			{#if r.note}<p class="small muted">Note: {r.note}</p>{/if}
			{#if r.status === 'open'}
				<form method="POST" action="?/resolve" class="row" use:enhance>
					<input type="hidden" name="id" value={r.id} />
					<input type="text" name="note" placeholder="Note (required to close without removal)" maxlength="1000" />
					<button class="small-btn" name="outcome" value="removed">Removed</button>
					<button class="small-btn ghost" name="outcome" value="rejected">Close without removal</button>
				</form>
				{#if form?.error && form.id === r.id}<p class="error small">{form.error}</p>{/if}
			{/if}
		</li>
	{:else}
		<li class="muted">Nothing here.</li>
	{/each}
</ul>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; margin: 0 0 10px; }
	.headline span { color: var(--pink); }
	.tabs { display: flex; gap: 6px; margin: 14px 0; }
	.tabs a { font-family: var(--mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 10px; border: 1.5px solid var(--line-2); border-radius: var(--radius); text-decoration: none; color: var(--dim); }
	.tabs a.active { background: var(--paper); color: var(--ink); border-color: var(--paper); }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.req { background: var(--ink-2); border-left: 4px solid var(--warn); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 6px; overflow-wrap: anywhere; }
	.req.late { border-left-color: var(--pink); }
	.req p { margin: 0; }
	.row { display: flex; gap: 6px; flex-wrap: wrap; }
	.row input { flex: 1 1 200px; min-width: 0; }
</style>
