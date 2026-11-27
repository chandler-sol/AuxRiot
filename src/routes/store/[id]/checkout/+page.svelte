<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import { money } from '#lib/store.ts';
	import { fillLicenseV5 } from '#lib/license.ts';
	import { buyerStatement, RECORDS_CONSENT } from '#lib/signing.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const it = $derived(data.item);
	const lic = $derived(data.license);
	let stems = $state(untrack(() => (data.stems ? '1' : '0')));
	let name = $state(untrack(() => data.legalName));
	let forEntity = $state(false);
	let entity = $state('');
	let role = $state('');
	let agreed = $state(false);
	let records = $state(false);
	let busy = $state(false);
	const total = $derived(stems === '1' ? (it.stemsPriceCents ?? it.priceCents) : it.priceCents);
	const pkg = $derived(stems === '1' ? 'Exclusive + Stems' : 'Exclusive');
	const beatAndPackage = $derived(`"${it.title}"${it.rounds > 1 ? ` (round ${it.round})` : ''}, ${pkg}`);
	const totalText = $derived(`$${(total / 100).toFixed(2)}`);
	const highlights = [
		'One buyer gets the exclusive license. It starts when your first download of the beat or stems finishes; until then you can cancel for a full refund.',
		'Download within 14 days or the order is canceled and refunded automatically.',
		'Unlimited commercial use: release, stream, sell, perform and sync. Credit “Prod. by ' + untrack(() => data.license.credit) + '”.',
		'Songwriting income on your releases is split 50/50 between the producer side and your side. You keep the master income.',
		'After delivery, a change of mind doesn’t qualify for a refund. Defective files, misdescription and copyright blocks are covered.'
	];
	const buyerName = $derived(name.trim());
	const party = $derived(buyerName ? (forEntity && entity.trim() ? `${entity.trim()}, signed by ${buyerName} (${role.trim() || 'authorized signer'})` : `${buyerName} (signing as self)`) : null);
	// The exact license they sign, filled in as they type.
	const preview = $derived(
		fillLicenseV5(lic.doc, {
			producerParty: lic.producerParty,
			producerCredit: lic.credit,
			buyerParty: party,
			beatTitle: it.rounds > 1 ? `${it.title} (round ${it.round})` : it.title,
			beatId: it.id,
			listingVersion: lic.listingVersion,
			orderId: null,
			priceCents: total,
			taxCents: null,
			stems: stems === '1',
			files: lic.file,
			stemsFile: lic.stemsFile,
			previewId: lic.previewId,
			rights: lic.rights,
			paidAt: null,
			licenseVersion: lic.version,
			storeTermsVersion: lic.version,
			merchant: data.merchant.line,
			deliveredAt: null,
			producerSignature: lic.producerSignedAt ? { name: lic.producerName ?? '', capacity: lic.producerCapacity, at: lic.producerSignedAt, id: lic.producerAcceptanceId } : null,
			buyerSignature: { name: buyerName, capacity: forEntity ? role : 'self', at: null, id: null }
		})
	);
	const ready = $derived(agreed && records && buyerName.length >= 3 && (!forEntity || (entity.trim().length >= 2 && role.trim().length >= 2)));
</script>

<svelte:head><title>Checkout · {it.title} · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/store/{it.id}">← Back to the beat</a></p>
<h1 class="headline">Check<span>out.</span></h1>

{#if data.outsideUS}
	<p class="notice small">Checkout is open to buyers in the United States for now. You can still listen and ask the producer questions.</p>
{/if}

<form method="POST" class="co" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
	<!-- 1. What they're buying -->
	<section class="step">
		<p class="mono stepn"><span>1</span> Your order</p>
		<div class="summary" style:--c={it.color}>
			<div class="sum-what">
				<span class="display st">{it.title}{#if it.rounds > 1} · round {it.round}{/if}</span>
				<span class="mono small by"><Avatar username={it.seller.username} avatarKey={it.seller.avatarKey} color={it.seller.color} size={20} /> @{it.seller.username} · licensor</span>
			</div>
			{#if it.hasStems}
				<div class="choice" role="radiogroup" aria-label="What you're buying">
					<label class:on={stems === '0'}><input type="radio" name="stems" value="0" bind:group={stems} /><span>Exclusive</span><span class="display cp">{money(it.priceCents)}</span></label>
					<label class:on={stems === '1'}><input type="radio" name="stems" value="1" bind:group={stems} /><span>Exclusive + Stems</span><span class="display cp">{money(it.stemsPriceCents)}</span></label>
				</div>
			{:else}
				<input type="hidden" name="stems" value="0" />
			{/if}
			<p class="line mono"><span>{pkg} license · {it.format?.toUpperCase() ?? 'MP3'}</span><span class="display tot">{money(total)}</span></p>
			<p class="small muted">Plus sales tax where it applies, shown on the payment screen.</p>
		</div>
	</section>

	<!-- 2. The license, before they pay -->
	<section class="step">
		<p class="mono stepn"><span>2</span> Your license</p>
		<p class="small lead">You're buying an <strong>exclusive license</strong> directly from the producer. It's a contract between the two of you; AuxRiot arranges the sale, delivers the files and handles refunds. The key points:</p>
		<ul class="keys">
			{#each highlights as h (h)}<li>{h}</li>{/each}
		</ul>
		<fieldset class="who">
			<legend class="mono">Signing as</legend>
			<div class="yn">
				<label class="opt"><input type="radio" name="signing_as" value="self" checked={!forEntity} onchange={() => (forEntity = false)} /> Myself</label>
				<label class="opt"><input type="radio" name="signing_as" value="entity" checked={forEntity} onchange={() => (forEntity = true)} /> A company or label</label>
			</div>
			{#if forEntity}
				<div class="two">
					<div><label for="entity">Legal entity name</label><input id="entity" name="entity" type="text" maxlength="120" bind:value={entity} placeholder="Label Records LLC" /></div>
					<div><label for="capacity">Your role</label><input id="capacity" name="capacity" type="text" maxlength="60" bind:value={role} placeholder="A&R manager" /></div>
				</div>
			{/if}
		</fieldset>
		<div>
			<label for="legal">Your full legal name</label>
			<input id="legal" type="text" name="legal_name" maxlength="100" required placeholder="As it should appear on the license" autocomplete="name" bind:value={name} />
			<p class="small muted hint">This is your electronic signature on the license.</p>
		</div>
		<details class="full">
			<summary class="mono">Read the full license (with your details) ▾</summary>
			<div class="doc"><LegalDoc source={preview} /></div>
		</details>
	</section>

	<!-- 3. Sign, then pay -->
	<section class="step">
		<p class="mono stepn"><span>3</span> Sign &amp; pay</p>
		<label class="agree" class:on={agreed}>
			<input type="checkbox" name="agree" bind:checked={agreed} />
			<span>{buyerStatement(beatAndPackage, totalText)} <span class="muted">(<a href="/store/terms" target="_blank">Store Terms</a> · <a href="/store/license" target="_blank">License</a>)</span></span>
		</label>
		<label class="agree" class:on={records}>
			<input type="checkbox" name="records" bind:checked={records} />
			<span>{RECORDS_CONSENT}</span>
		</label>
		<dl class="facts small">
			<dt>Licensor</dt><dd>{lic.producerParty ?? `@${it.seller.username}`}</dd>
			<dt>Card payment</dt><dd>{data.merchant.name}</dd>
			<dt>On your statement</dt><dd class="mono">{data.merchant.descriptor}</dd>
			<dt>Questions</dt><dd>hello@auxriot.com</dd>
		</dl>
		{#if form?.error}<p class="error small">{form.error}</p>{/if}
		<button class="primary full pay" disabled={busy || !ready || data.outsideUS}>{busy ? 'Opening secure payment…' : `Sign and pay ${totalText}`}</button>
		<p class="small muted fine">Payment is handled by Stripe; AuxRiot never sees your card. Nothing is charged until you confirm on the next screen. The beat is held for you for 30 minutes. You'll get the signed agreement and a receipt by email. Questions? <a href="/store/faq" target="_blank">Store FAQ</a></p>
	</section>
</form>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); text-decoration: none; }
	.headline { font-size: clamp(3rem, 14vw, 4.6rem); line-height: 0.9; margin: 0 0 20px; }
	.headline span { color: var(--pink); }
	.notice { border-left: 4px solid var(--warn); background: var(--ink-2); padding: 10px 12px; border-radius: var(--radius); }
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
	.who { border: 0; margin: 0; padding: 0; display: grid; gap: 8px; }
	.who legend { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--paper); margin-bottom: 6px; }
	.yn { display: flex; gap: 18px; flex-wrap: wrap; }
	.opt { display: inline-flex; gap: 8px; align-items: center; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--paper); font-size: 0.95rem; cursor: pointer; }
	.opt input { width: 18px; height: 18px; accent-color: var(--pink); margin: 0; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.two > div { min-width: 0; }
	.two input, #legal { width: 100%; box-sizing: border-box; }
	.hint { margin-top: 8px !important; }
	.full { border: 1.5px solid var(--line-2); border-radius: var(--radius); min-width: 0; }
	.full summary { cursor: pointer; padding: 12px 14px; font-size: 0.72rem; color: var(--paper); list-style: none; }
	.full summary::-webkit-details-marker { display: none; }
	.full[open] summary { border-bottom: 1.5px dashed var(--line-2); }
	.doc { max-height: 60vh; overflow-y: auto; padding: 4px 14px 10px; overscroll-behavior: contain; }
	.doc :global(.legal h1) { font-size: 1.8rem; }
	.agree { display: flex; gap: 12px; align-items: flex-start; margin: 0; padding: 12px 14px; border: 1.5px solid var(--line-2); border-radius: var(--radius); text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--dim); font-size: 0.92rem; line-height: 1.5; cursor: pointer; }
	.agree.on { border-color: var(--paper); color: var(--paper); }
	.agree input { width: 22px; height: 22px; accent-color: var(--pink); flex: none; margin-top: 1px; }
	.facts { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 14px; color: var(--dim); }
	.facts dt { font-family: var(--mono); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 3px; }
	.facts dd { margin: 0; color: var(--paper); overflow-wrap: anywhere; }
	.pay { width: 100%; min-height: 54px; font-size: 1.15rem; }
	.fine { line-height: 1.55; text-align: center; }
	@media (max-width: 480px) { .two { grid-template-columns: 1fr; } }
</style>
