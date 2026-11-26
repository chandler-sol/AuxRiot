<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import { money } from '#lib/store.ts';
	import { deliveredFiles, fillLicense, licenseHighlights } from '#lib/license.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const it = $derived(data.item);
	let stems = $state(untrack(() => (data.stems ? '1' : '0')));
	let name = $state(untrack(() => data.legalName));
	let agreed = $state(false);
	let busy = $state(false);
	const total = $derived(stems === '1' ? (it.stemsPriceCents ?? it.priceCents) : it.priceCents);
	const highlights = $derived(licenseHighlights(data.license.doc));
	// The exact license they're agreeing to, with their name filled in as they type.
	const preview = $derived(
		fillLicense(data.license.doc, {
			producerName: data.license.producerName,
			producerSignedAt: data.license.producerSignedAt,
			buyerName: name.trim() || null,
			buyerSignedAt: null,
			beatTitle: it.rounds > 1 ? `${it.title} (round ${it.round})` : it.title,
			priceCents: total,
			saleDate: null,
			orderNumber: null,
			deliveredFiles: deliveredFiles(it.format, it.tagged, stems === '1'),
			samples: data.license.samples
		})
	);
</script>

<svelte:head><title>Checkout · {it.title} · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/store/{it.id}">← Back to the beat</a></p>
<h1 class="headline">Check<span>out.</span></h1>

<form method="POST" class="co" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
	<!-- 1. What they're buying -->
	<section class="step">
		<p class="mono stepn"><span>1</span> Your order</p>
		<div class="summary" style:--c={it.color}>
			<div class="sum-what">
				<span class="display st">{it.title}{#if it.rounds > 1} · round {it.round}{/if}</span>
				<span class="mono small by"><Avatar username={it.seller.username} avatarKey={it.seller.avatarKey} color={it.seller.color} size={20} /> @{it.seller.username}</span>
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
			<p class="small muted">Plus sales tax where it applies, shown on the payment screen.</p>
		</div>
	</section>

	<!-- 2. The license, before they pay -->
	<section class="step">
		<p class="mono stepn"><span>2</span> Your license</p>
		<p class="small lead">You're buying an <strong>exclusive license</strong> directly from @{it.seller.username}. It's a contract between the two of you, signed with your legal name. The key points:</p>
		<ul class="keys">
			{#each highlights as h (h)}<li>{h}</li>{/each}
			<li>Refunds are available until your first download; after that the sale is final.</li>
		</ul>
		<div>
			<label for="legal">Your full legal name</label>
			<input id="legal" type="text" name="legal_name" maxlength="100" required placeholder="As it should appear on the license" autocomplete="name" bind:value={name} />
			<p class="small muted hint">This is your signature on the license.</p>
		</div>
		<details class="full">
			<summary class="mono">Read the full license (with your details) ▾</summary>
			<div class="doc"><LegalDoc source={preview} /></div>
		</details>
	</section>

	<!-- 3. Agree, then pay -->
	<section class="step">
		<p class="mono stepn"><span>3</span> Agree &amp; pay</p>
		<label class="agree" class:on={agreed}>
			<input type="checkbox" name="agree" required bind:checked={agreed} />
			<span>I've read and agree to the <a href="/store/license" target="_blank">Exclusive Beat License</a> and the <a href="/store/terms" target="_blank">Store Terms</a>, and I sign the license as <strong>{name.trim() || 'my legal name above'}</strong>.</span>
		</label>
		{#if form?.error}<p class="error small">{form.error}</p>{/if}
		<button class="primary full pay" disabled={busy || !agreed || name.trim().length < 3}>{busy ? 'Opening secure payment…' : `Agree & continue to payment · ${money(total)}`}</button>
		<p class="small muted fine">Payment is handled by Stripe; AuxRiot never sees your card. Nothing is charged until you confirm on the next screen. The beat is held for you for 30 minutes, and your files and signed license arrive the moment payment clears.</p>
	</section>
</form>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); text-decoration: none; }
	.headline { font-size: clamp(3rem, 14vw, 4.6rem); line-height: 0.9; margin: 0 0 20px; }
	.headline span { color: var(--pink); }
	.co { display: grid; gap: 28px; max-width: 620px; }
	.step { display: grid; gap: 14px; min-width: 0; }
	.step p { margin: 0; }
	.stepn { display: flex; align-items: center; gap: 10px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--paper); }
	.stepn span { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--pink); color: var(--ink); font-size: 0.75rem; }
	.summary { background: var(--ink-2); border-left: 5px solid var(--c); border-radius: var(--radius); padding: 16px; display: grid; gap: 14px; }
	.summary p { margin: 0; }
	.sum-what { display: grid; gap: 6px; min-width: 0; }
	.st { font-size: 1.7rem; line-height: 1; overflow-wrap: anywhere; }
	.by { display: inline-flex; align-items: center; gap: 6px; color: var(--dim); }
	.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.choice label { position: relative; display: grid; gap: 4px; margin: 0; padding: 10px 12px; border: 1.5px solid var(--line-2); border-radius: var(--radius); cursor: pointer; text-transform: none; letter-spacing: 0; font-family: var(--body); color: var(--paper); font-weight: 600; }
	.choice label.on { border-color: var(--paper); background: var(--ink); }
	.choice input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
	.choice .cp { font-size: 1.7rem; line-height: 1; color: var(--dim); }
	.choice label.on .cp { color: var(--paper); }
	.line { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; border-top: 1.5px dashed var(--line-2); padding-top: 12px; color: var(--dim); font-size: 0.72rem; }
	.tot { font-size: 2rem; color: var(--paper); }
	.lead { color: var(--dim); line-height: 1.55; }
	.lead strong { color: var(--paper); }
	.keys { margin: 0; padding: 12px 14px 12px 32px; background: var(--ink-2); border-left: 4px solid var(--pink); border-radius: var(--radius); display: grid; gap: 6px; color: var(--paper); line-height: 1.5; font-size: 0.92rem; }
	#legal { width: 100%; box-sizing: border-box; }
	.hint { margin-top: 8px !important; }
	.full { border: 1.5px solid var(--line-2); border-radius: var(--radius); min-width: 0; }
	.full summary { cursor: pointer; padding: 12px 14px; font-size: 0.72rem; color: var(--paper); list-style: none; }
	.full summary::-webkit-details-marker { display: none; }
	.full[open] summary { border-bottom: 1.5px dashed var(--line-2); }
	.doc { max-height: 60vh; overflow-y: auto; padding: 4px 14px 10px; overscroll-behavior: contain; }
	.doc :global(.legal h1) { font-size: 1.8rem; }
	.agree { display: flex; gap: 12px; align-items: flex-start; margin: 0; padding: 12px 14px; border: 1.5px solid var(--line-2); border-radius: var(--radius); text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--dim); font-size: 0.95rem; line-height: 1.5; cursor: pointer; }
	.agree.on { border-color: var(--paper); color: var(--paper); }
	.agree strong { color: var(--paper); overflow-wrap: anywhere; }
	.agree input { width: 22px; height: 22px; accent-color: var(--pink); flex: none; margin-top: 1px; }
	.pay { width: 100%; min-height: 54px; font-size: 1.15rem; }
	.fine { line-height: 1.55; text-align: center; }
</style>
