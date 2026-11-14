<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const IDEAS = $derived(
		data.kind === 'service'
			? ["Here's what I need:", 'What do you need from me (stems, references)?', 'How long would this take?', 'What would it cost for my project?']
			: ['Is this still available?', 'Do you have a version without the tag?', "What's in the stems?", 'Can you do a custom key or tempo?']
	);
	const who = $derived(data.kind === 'service' ? data.service!.producer : data.listing!.producer);
	const what = $derived(data.kind === 'service' ? `${data.service!.category}: "${data.service!.title}"` : `"${data.listing!.title}"`);
	const price = $derived(data.kind === 'service' ? `from ${data.service!.price}` : data.listing!.price);
	const back = $derived(data.kind === 'service' ? `/u/${data.service!.producer}#services` : `/battles/${data.listing!.battleId}#buy`);
	let body = $state('');
	$effect.pre(() => {
		if (form?.body && !body) body = form.body;
	});
</script>

<svelte:head><title>{data.kind === 'service' ? 'Request a quote' : 'Ask'} · @{who} · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href={back}>← Back</a></p>
<h1 class="headline">{data.kind === 'service' ? 'Request a quote from' : 'Ask'} <span>@{who}</span></h1>
<p class="sub">{what}{price ? ` · ${price}` : ''}. Only you and {who} see this.</p>

{#if !data.verified}
	<p class="error">Confirm your email to message producers — check your inbox for the link.</p>
{:else}
	<form method="POST" class="stack" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
		<div class="ideas">
			{#each IDEAS as i (i)}<button type="button" class="chip" onclick={() => (body = body ? `${body}\n${i}` : i)}>{i}</button>{/each}
		</div>
		<textarea name="body" rows="5" maxlength="2000" required placeholder="Your question…" bind:value={body}></textarea>
		{#if form?.error}<p class="error small">{form.error}</p>{/if}
		<p class="small muted">🔒 Keep the deal on AuxRiot — arranging payment elsewhere for a listed beat or service isn't allowed and isn't protected.</p>
		<button class="primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send message'}</button>
	</form>
{/if}

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.4rem, 11vw, 4rem); line-height: 0.92; overflow-wrap: anywhere; }
	.headline span { color: var(--pink); }
	.sub { color: var(--dim); margin: 8px 0 16px; }
	.ideas { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip { min-height: 34px; padding: 0 12px; font-family: var(--body); text-transform: none; letter-spacing: 0; font-size: 0.85rem; border-radius: 999px; color: var(--dim); }
	.chip:hover { color: var(--paper); }
</style>
