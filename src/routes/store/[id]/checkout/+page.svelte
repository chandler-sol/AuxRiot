<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import { money } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const it = $derived(data.item);
	import { untrack } from 'svelte';
	let stems = $state(untrack(() => (data.stems ? '1' : '0')));
	let busy = $state(false);
	const total = $derived(stems === '1' ? (it.stemsPriceCents ?? it.priceCents) : it.priceCents);
</script>

<svelte:head><title>Checkout · {it.title} · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/store/{it.id}">← Back to the beat</a></p>
<h1 class="headline">Check<span>out.</span></h1>

<form method="POST" class="co" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
	<section class="summary" style:--c={it.color}>
		<div class="sum-top">
			<div class="sum-what">
				<span class="display st">{it.title}{#if it.rounds > 1} · round {it.round}{/if}</span>
				<span class="mono small by"><Avatar username={it.seller.username} avatarKey={it.seller.avatarKey} color={it.seller.color} size={20} /> @{it.seller.username}</span>
			</div>
		</div>
		{#if it.hasStems}
			<div class="choice" role="radiogroup" aria-label="What you're buying">
				<label class:on={stems === '0'}><input type="radio" name="stems" value="0" bind:group={stems} /><span>Beat</span><span class="display cp">{money(it.priceCents)}</span></label>
				<label class:on={stems === '1'}><input type="radio" name="stems" value="1" bind:group={stems} /><span>Beat + stems</span><span class="display cp">{money(it.stemsPriceCents)}</span></label>
			</div>
		{:else}
			<input type="hidden" name="stems" value="0" />
		{/if}
		<p class="line mono"><span>Exclusive license · {it.format?.toUpperCase() ?? 'MP3'}{stems === '1' ? ' + stems' : ''}</span><span class="display tot">{money(total)}</span></p>
		<p class="small muted">Sales tax is added on the next screen where it applies.</p>
	</section>

	<div class="buyf">
		<div>
			<label for="legal">Your full legal name</label>
			<input id="legal" type="text" name="legal_name" maxlength="100" required placeholder="Printed on your license" autocomplete="name" value={data.legalName} />
			<p class="small muted hint">It goes on the license that proves you own the exclusive rights.</p>
		</div>
		<label class="agree"><input type="checkbox" name="agree" required /><span>I agree to the <a href="/store/license" target="_blank">Exclusive Beat License</a> and the <a href="/store/terms" target="_blank">Store Terms</a>. Refunds are available until my first download.</span></label>
	</div>

	{#if form?.error}<p class="error small">{form.error}</p>{/if}
	<button class="primary full" disabled={busy}>{busy ? 'Opening secure payment…' : `Continue to payment · ${money(total)}`}</button>
	<p class="small muted fine">Payment is handled by Stripe; AuxRiot never sees your card. The beat is held for you for 30 minutes. Your files and signed license arrive the moment payment clears.</p>
</form>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); text-decoration: none; }
	.headline { font-size: clamp(3rem, 14vw, 4.6rem); line-height: 0.9; margin: 0 0 18px; }
	.headline span { color: var(--pink); }
	.co { display: grid; gap: 22px; max-width: 560px; }
	.co > button { width: 100%; min-height: 52px; font-size: 1.2rem; }
	.summary { background: var(--ink-2); border-left: 5px solid var(--c); border-radius: var(--radius); padding: 16px; display: grid; gap: 14px; }
	.summary p { margin: 0; }
	.sum-what { display: grid; gap: 6px; min-width: 0; }
	.st { font-size: 1.7rem; line-height: 1; overflow-wrap: anywhere; }
	.by { display: inline-flex; align-items: center; gap: 6px; color: var(--dim); }
	.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.choice label { position: relative; display: grid; gap: 2px; margin: 0; padding: 10px 12px; border: 1.5px solid var(--line-2); border-radius: var(--radius); cursor: pointer; text-transform: none; letter-spacing: 0; font-family: var(--body); color: var(--paper); font-weight: 600; }
	.choice label.on { border-color: var(--paper); background: var(--ink); }
	.choice input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
	.choice .cp { font-size: 1.7rem; line-height: 1; color: var(--dim); }
	.choice label.on .cp { color: var(--paper); }
	.line { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; border-top: 1.5px dashed var(--line-2); padding-top: 12px; color: var(--dim); font-size: 0.72rem; }
	.tot { font-size: 2rem; color: var(--paper); }
	.buyf { display: grid; gap: 18px; }
	.buyf input[name='legal_name'] { width: 100%; box-sizing: border-box; }
	.hint { margin: 8px 0 0; line-height: 1.5; }
	.agree { display: flex; gap: 10px; align-items: flex-start; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--dim); font-size: 0.92rem; }
	.agree input { width: 20px; height: 20px; accent-color: var(--pink); flex: none; margin-top: 1px; }
	.fine { margin: -8px 0 0; line-height: 1.55; text-align: center; }
</style>
