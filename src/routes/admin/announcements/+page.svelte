<script lang="ts">
	import { enhance } from '$app/forms';
	import AnnouncementModal from '#lib/components/AnnouncementModal.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	type Row = (typeof data.announcements)[number];
	let editing = $state<Row | null>(null);
	let title = $state('');
	let body = $state('');
	let label = $state('');
	let link = $state('');
	let previewKey = $state(0);
	let previewing = $state(false);

	function edit(a: Row | null) {
		editing = a;
		title = a?.title ?? '';
		body = a?.body ?? '';
		label = a?.button_label ?? '';
		link = a?.button_url ?? '';
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
	const local = (t: number | null) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
	const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	const AUD: Record<string, string> = { all: 'Everyone', signed_in: 'Signed-in users', signed_out: 'Visitors (signed out)' };
	const status = (a: Row) =>
		!a.active ? 'Off' : a.ends_at && a.ends_at < data.now ? 'Ended' : a.starts_at && a.starts_at > data.now ? `Starts ${when(a.starts_at)}` : 'Live';
</script>

<svelte:head><title>Announcements · Admin</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Admin</a> — Announcements</p>
<h1 class="headline">Announce<span>ments.</span></h1>
<p class="muted small">A pop-up shown once per person. It closes with ✕, "Got it", Esc or a tap outside, and never shows to them again. Only the newest live one shows at a time. It never appears on checkout.</p>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

<form method="POST" action="?/save" class="card stack" use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') edit(null); }}>
	<h2>{editing ? 'Edit announcement' : 'New announcement'}</h2>
	{#if editing}<input type="hidden" name="id" value={editing.id} /><p class="small muted">Edits keep the same announcement, so people who closed it won't see it again. For something new, make a new one.</p>{/if}
	<div><label for="title">Title</label><input id="title" name="title" maxlength="120" required bind:value={title} placeholder="The store is open" /></div>
	<div><label for="body">Message</label><textarea id="body" name="body" rows="4" maxlength="1200" required bind:value={body} placeholder="Short and punchy. Leave a blank line between paragraphs."></textarea></div>
	<div class="two">
		<div><label for="button_label">Button label (optional)</label><input id="button_label" name="button_label" maxlength="40" bind:value={label} placeholder="Browse beats" /></div>
		<div><label for="button_url">Button link</label><input id="button_url" name="button_url" maxlength="500" bind:value={link} placeholder="/store" /></div>
	</div>
	<div class="three">
		<div>
			<label for="audience">Who sees it</label>
			<select id="audience" name="audience" value={editing?.audience ?? 'all'}>
				<option value="all">Everyone</option>
				<option value="signed_in">Signed-in users</option>
				<option value="signed_out">Visitors (signed out)</option>
			</select>
		</div>
		<div><label for="starts_at">Start (optional)</label><input id="starts_at" name="starts_at" type="datetime-local" value={local(editing?.starts_at ?? null)} /></div>
		<div><label for="ends_at">End (optional)</label><input id="ends_at" name="ends_at" type="datetime-local" value={local(editing?.ends_at ?? null)} /></div>
	</div>
	<div class="row">
		<button type="button" onclick={() => { previewing = true; previewKey++; }} disabled={!title || !body}>Preview</button>
		<button name="go" value="draft">Save draft</button>
		<button class="primary" name="go" value="publish">Publish</button>
		{#if editing}<button type="button" class="ghost" onclick={() => edit(null)}>Cancel</button>{/if}
	</div>
</form>

{#if previewing}
	{#key previewKey}<AnnouncementModal preview announcement={{ id: 'preview', title, body, buttonLabel: label || null, buttonUrl: link || null }} />{/key}
{/if}

<ul class="list">
	{#each data.announcements as a (a.id)}
		<li class="ann" class:live={status(a) === 'Live'}>
			<div class="top">
				<strong class="t">{a.title}</strong>
				<span class="mono tag">{status(a)}</span>
			</div>
			<p class="small muted">{AUD[a.audience]} · by @{a.created_by} {when(a.created_at)} · closed by {a.dismissals} {a.dismissals === 1 ? 'account' : 'accounts'}{a.ends_at ? ` · ends ${when(a.ends_at)}` : ''}</p>
			<div class="row">
				<form method="POST" action="?/toggle" use:enhance><input type="hidden" name="id" value={a.id} /><input type="hidden" name="on" value={a.active ? '0' : '1'} /><button class="small-btn">{a.active ? 'Switch off' : 'Switch on'}</button></form>
				<button type="button" class="small-btn" onclick={() => edit(a)}>Edit</button>
				<form method="POST" action="?/remove" use:enhance={({ cancel }) => { if (!confirm('Delete this announcement?')) cancel(); }}><input type="hidden" name="id" value={a.id} /><button class="small-btn ghost">Delete</button></form>
			</div>
		</li>
	{:else}
		<li class="muted">No announcements yet.</li>
	{/each}
</ul>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.6rem, 11vw, 4.2rem); line-height: 0.9; margin: 0 0 10px; }
	.headline span { color: var(--pink); }
	form.card { margin: 14px 0; }
	textarea, input:not([type='hidden']), select { width: 100%; box-sizing: border-box; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
	.two > div, .three > div { min-width: 0; }
	.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.ann { background: var(--ink-2); border-left: 4px solid var(--line-2); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 6px; min-width: 0; }
	.ann.live { border-left-color: var(--pink); }
	.ann p { margin: 0; }
	.top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
	.t { overflow-wrap: anywhere; }
	.tag { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 6px; border: 1.5px solid var(--line-2); border-radius: 2px; white-space: nowrap; }
	@media (max-width: 560px) { .two, .three { grid-template-columns: 1fr; } }
</style>
