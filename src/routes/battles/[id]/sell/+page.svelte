<script lang="ts">
	import { enhance } from '$app/forms';
	import StoreFileUpload from '#lib/components/StoreFileUpload.svelte';
	import SellerAgreement from '#lib/components/SellerAgreement.svelte';
	import { money, money2, splitSale } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const l = $derived(data.listing);
	const locked = $derived(l.status === 'sold' || l.status === 'removed');

	// Live earnings preview, seeded from the saved listing.
	let price = $state('');
	let stems = $state('');
	let seeded = false;
	$effect.pre(() => {
		if (seeded) return;
		seeded = true;
		price = l.priceCents ? String(l.priceCents / 100) : '';
		stems = l.stemsPriceCents ? String(l.stemsPriceCents / 100) : '';
	});
	const cents = (s: string) => {
		const n = Math.round(Number(s.replace(/[$,\s]/g, '')) * 100);
		return Number.isFinite(n) && n > 0 ? n : 0;
	};
	const ex = $derived(cents(price) ? splitSale(cents(price), data.settings.feePct) : null);
	const st = $derived(cents(stems) ? splitSale(cents(stems), data.settings.feePct) : null);
	const underMin = $derived(cents(price) > 0 && cents(price) < data.settings.minPriceCents);

	const STATUS: Record<string, string> = { draft: 'Draft — not on sale yet', listed: 'On sale', unlisted: 'Off the store', sold: 'Sold', removed: 'Removed' };
	// Rights schedule: each line answered, "none" included.
	type RK = 'samples' | 'ai' | 'voice' | 'restrictions';
	const RK: RK[] = ['samples', 'ai', 'voice', 'restrictions'];
	const HINT: Record<RK, string> = {
		samples: "What's sampled, from where, and your clearance (license, reference). Both the recording and the composition.",
		ai: 'Which elements, the tool, and any terms limiting transfer or commercial use.',
		voice: 'Whose voice or likeness, and the written permission you have.',
		restrictions: 'Any tool, library or license terms that limit transfer, sync, stems or commercial use.'
	};
	let has = $state<Record<RK, 'none' | 'yes' | ''>>({ samples: '', ai: '', voice: '', restrictions: '' });
	let entity = $state(false);
	let seededR = false;
	$effect.pre(() => {
		if (seededR) return;
		seededR = true;
		const r = l.rights;
		for (const k of RK) has[k] = r ? (r[k] && r[k] !== 'none' ? 'yes' : 'none') : '';
		entity = !!l.entity;
	});
	const answered = $derived(RK.every((k) => has[k]));
	let commits = $state<boolean[]>([]);
	const allCommitted = $derived(data.checklist.listing.every((_, i) => commits[i]));
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>Sell your beat · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/battles/{data.battle.id}">← "{data.battle.title}"</a></p>
<h1 class="headline">Sell this <span>beat.</span></h1>
{#if data.battle.rounds > 1}<p class="mono roundtag">Round {data.battle.round} of {data.battle.rounds} · each beat in the set sells on its own</p>{/if}
<p class="status mono" class:on={l.status === 'listed'}>{STATUS[l.status] ?? l.status}</p>

<div class="explain">
	{#if !data.seller.payoutsOn}<p class="payoutnote"><strong>Set up payouts</strong> so buyers can check out — Stripe pays you weekly on Mondays. <a href="/settings/payouts">Set up payouts →</a></p>{/if}
	<p><strong>Exclusive only.</strong> One buyer gets the beat, then it's off the market for good. The battle stays up with a SOLD stamp.</p>
	<p class="small muted"><a href="/store/terms">Store Terms</a> · <a href="/store/license">Exclusive Beat License</a> · version 5 · <a href="/store/faq">Store FAQ</a></p>
	<p class="small muted">
		{#if data.battle.buyOpen}
			Buyers can check out as soon as it's listed.
		{:else}
			Your listing can go live now, but <strong>Buy unlocks when the battle ends</strong> — so nobody can sway the vote with a purchase.
		{/if}
	</p>
</div>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

{#if !data.seller.agreed && !locked}
	<SellerAgreement error={form?.agreeError ?? ''} />
{:else if locked}
	<p class="muted">This beat {l.status === 'sold' ? 'has been sold' : 'was removed'} and can't be edited.</p>
{:else}
	<form method="POST" action="?/save" class="stack" use:enhance={keep}>
		<section class="card stack">
			<h2>Price</h2>
			<div class="two">
				<div>
					<label for="price">Exclusive</label>
					<div class="dollar"><span>$</span><input id="price" name="price" type="text" inputmode="decimal" placeholder="50" bind:value={price} /></div>
				</div>
				<div>
					<label for="stems_price">Exclusive + Stems</label>
					<div class="dollar"><span>$</span><input id="stems_price" name="stems_price" type="text" inputmode="decimal" placeholder="Optional" bind:value={stems} /></div>
				</div>
			</div>
			{#if underMin}
				<p class="warn small">Heads up: we suggest at least {money(data.settings.minPriceCents)} for an exclusive. Lower is allowed — it's your call.</p>
			{/if}
			{#if ex}
				<div class="earn">
					<p class="display">You get {money2(ex.netCents)}{#if st}<span class="muted"> · {money2(st.netCents)} with stems</span>{/if}</p>
					<p class="mono small">
						Price {money2(ex.priceCents)} − AuxRiot fee {data.settings.feePct}% ({money2(ex.feeCents)}) − card processing 2.9% + 30¢ ({money2(ex.processingCents)})
					</p>
					<p class="small muted">
						Card processing is what the payment company charges to run the buyer's card. It comes out of your share, not the buyer's price.
						Your discount codes come off the sale price (our fee shrinks with it). AuxRiot-wide sales never cut into your share.
					</p>
				</div>
			{/if}
		</section>

		<section class="card stack">
			<h2>Store details</h2>
			<div class="three">
				<div><label for="bpm">BPM</label><input id="bpm" name="bpm" type="text" inputmode="numeric" placeholder="140" value={l.bpm ?? ''} /></div>
				<div>
					<label for="music_key">Key</label>
					<select id="music_key" name="music_key" value={l.musicKey ?? ''}>
						<option value="">—</option>
						{#each data.options.keys as k (k)}<option value={k}>{k}</option>{/each}
					</select>
				</div>
				<div>
					<label for="genre">Genre</label>
					<select id="genre" name="genre" value={l.genre ?? ''}>
						<option value="">—</option>
						{#each data.options.genres as g (g)}<option value={g}>{g}</option>{/each}
					</select>
				</div>
			</div>
			<fieldset>
				<legend class="mono">Mood (up to 3)</legend>
				<div class="moods">
					{#each data.options.moods as m (m)}
						<label class="chip"><input type="checkbox" name="moods" value={m} checked={l.moods.includes(m)} /> <span>{m}</span></label>
					{/each}
				</div>
			</fieldset>
		</section>

		<section class="card stack">
			<h2>Files the buyer gets</h2>
			<p class="small muted">Private — only the buyer can download these, after paying. The 2:00 battle version is never the product.</p>
			<StoreFileUpload
				listingId={l.id}
				kind="file"
				current={l.file}
				accept=".wav,.mp3,audio/wav,audio/mpeg"
				label="Full beat · WAV or MP3"
				hint="Full length. Untagged is standard, but it's your call."
			/>
			<label class="check"><input type="checkbox" name="tagged" checked={l.tagged} /> <span>This file still has my producer tag in it (we'll tell buyers)</span></label>
			<StoreFileUpload listingId={l.id} kind="stems" current={l.stems} accept=".zip,application/zip" label="Stems · one .zip (optional)" hint="Needed if you set an Exclusive + Stems price. Up to 4 GB." />
			{#if l.stems}
				<button formaction="?/removeStems" class="ghost small-btn" formnovalidate>Remove stems</button>
			{/if}
		</section>

		<section class="card stack sign">
			<h2>Rights schedule</h2>
			{#if l.fromDefaults}<p class="small prefill">Filled in from your last signed listing. Check each answer for this beat before you sign.</p>{/if}
			<p class="small muted">Goes on the buyer's license. Answer every line; "none" is an answer. AuxRiot doesn't clear samples for you.</p>
			<div>
				<label for="writers">{data.checklist.rightsLabels.writers}</label>
				<textarea id="writers" name="writers" rows="2" maxlength="600" placeholder="e.g. Sole writer and producer, 100%. No publisher.">{l.rights?.writers ?? ''}</textarea>
				<p class="small muted">Everyone who wrote or co-produced it, their shares, publishers or society (IPI) if any. You need written authority from each.</p>
			</div>
			{#each RK as k (k)}
				<fieldset class="rs">
					<legend>{data.checklist.rightsLabels[k]}</legend>
					<div class="yn">
						<label class="opt"><input type="radio" name="{k}_has" value="none" bind:group={has[k]} /> None</label>
						<label class="opt"><input type="radio" name="{k}_has" value="yes" bind:group={has[k]} /> Yes</label>
					</div>
					{#if has[k] === 'yes'}
						<textarea name={k} rows="2" maxlength="600" placeholder={HINT[k]}>{l.rights?.[k] && l.rights[k] !== 'none' ? l.rights[k] : ''}</textarea>
					{/if}
				</fieldset>
			{/each}
		</section>

		<section class="card stack sign">
			<h2>Credit &amp; signer</h2>
			<div>
				<label for="credit">Public credit ("Prod. by …")</label>
				<input id="credit" name="credit" type="text" maxlength="60" value={l.credit} />
			</div>
			<fieldset class="rs">
				<legend>Signing as</legend>
				<div class="yn">
					<label class="opt"><input type="radio" name="signing_as" value="self" checked={!entity} onchange={() => (entity = false)} /> Myself</label>
					<label class="opt"><input type="radio" name="signing_as" value="entity" checked={entity} onchange={() => (entity = true)} /> A company or entity</label>
				</div>
				{#if entity}
					<div class="two">
						<div><label for="entity">Legal entity name</label><input id="entity" name="entity" type="text" maxlength="120" value={l.entity} placeholder="Beatworks LLC" /></div>
						<div><label for="capacity">Your role</label><input id="capacity" name="capacity" type="text" maxlength="60" value={l.capacity === 'self' ? '' : l.capacity} placeholder="Owner" /></div>
					</div>
				{/if}
			</fieldset>
			<div>
				<label for="legal_name">Your full legal name</label>
				<input id="legal_name" name="legal_name" type="text" autocomplete="name" maxlength="120" value={data.seller.legalName} />
				<p class="small muted">Private. Shown only to the buyer on the signed license.</p>
			</div>
		</section>

		<section class="card stack sign offer">
			<h2>Sign the offer</h2>
			{#if l.signed}
				<p class="signed mono small">✓ Version {l.signed.version} signed by {l.signed.name} · {new Date(l.signed.at).toLocaleDateString()}</p>
				<p class="small muted">Changing the price, files, credit, signer or rights schedule needs a new signature.</p>
			{:else}
				{#if l.staleSignature}<p class="warn small">The store terms were updated (version 5). Review and sign this listing again so buyers can check out.</p>{/if}
				<div class="summary">
					<p class="mono small muted">What you're offering · listing version {l.version + 1} · license {data.checklist.licenseVersion}</p>
					<dl>
						<dt>Beat</dt><dd>"{data.battle.title}"{data.battle.rounds > 1 ? ` · round ${data.battle.round}` : ''} · ID {l.id}</dd>
						<dt>Files</dt><dd>{l.file ? `${l.file.name} (${(l.file.format ?? '').toUpperCase()}${l.tagged ? ', tagged' : ', untagged'})` : 'not uploaded yet'}{l.stems ? ` + stems ${l.stems.name}` : ''}</dd>
						<dt>Packages</dt><dd>Exclusive {price ? `$${price}` : '—'}{stems ? ` · Exclusive + Stems $${stems}` : ''}</dd>
						<dt>Your net</dt><dd>{ex ? money2(ex.netCents) : '—'}{st ? ` · ${money2(st.netCents)} with stems` : ''}</dd>
						<dt>Preview</dt><dd>The 2:00 battle version (stays public with a SOLD mark)</dd>
					</dl>
					<p class="small muted">Read the full <a href="/store/license" target="_blank">Exclusive Beat License</a> and <a href="/store/terms" target="_blank">Store Terms</a>. Save and fix anything before signing.</p>
				</div>
				<ul class="commits">
					{#each data.checklist.listing as text, i (i)}
						<li><label class="check"><input type="checkbox" name="commit" value={i} bind:checked={commits[i]} /> <span>{text}</span></label></li>
					{/each}
				</ul>
				<div>
					<label for="signature">Type your full legal name to sign</label>
					<input id="signature" name="signature" type="text" maxlength="120" autocomplete="off" />
				</div>
			{/if}
		</section>

		{#if l.missing.length && l.status !== 'listed'}
			<p class="small muted">Still needed to go on sale: {l.missing.join(', ')}.</p>
		{/if}
		<div class="row actions">
			<button>Save {l.status === 'listed' ? 'changes' : 'draft'}</button>
			{#if !l.signed}
				<button class="primary" name="go" value="sign" disabled={!allCommitted || !answered}>Sign and list this beat</button>
			{:else if l.status !== 'listed'}
				<button class="primary" name="publish" value="1">Put it on sale</button>
			{/if}
		</div>
	</form>
	{#if l.status === 'listed'}
		<form method="POST" action="?/unlist" use:enhance={keep} class="unlist"><button class="ghost">Take off the store</button></form>
	{/if}
{/if}

<style>
	.payoutnote { border: 1.5px dashed var(--warn); border-radius: var(--radius); padding: 10px 12px; }
	.payoutnote a { color: var(--warn); }
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.status { color: var(--dim); margin: 10px 0 12px; }
	.roundtag { color: var(--pink); margin: 8px 0 0; font-size: 0.7rem; }
	.status.on { color: var(--pink); }
	.explain { border-left: 4px solid var(--pink); padding: 2px 0 2px 12px; margin-bottom: 14px; }
	.explain p { margin: 0 0 6px; }
	section { margin-bottom: 4px; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.three { display: grid; grid-template-columns: 1fr 1.4fr 1.4fr; gap: 10px; }
	.dollar { display: flex; align-items: center; gap: 6px; min-width: 0; }
	.dollar input { flex: 1; min-width: 0; width: 100%; }
	.two > div, .three > div { min-width: 0; }
	.dollar span { font-family: var(--display); font-size: 1.4rem; color: var(--dim); }
	.earn { background: var(--ink); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 6px; }
	.earn .display { font-size: 1.6rem; margin: 0; color: var(--pink); }
	.earn .display .muted { font-size: 1rem; }
	.earn p { margin: 0; }
	.earn .mono { color: var(--paper); font-weight: 400; font-size: 0.7rem; }
	.warn { color: var(--warn); margin: 0; }
	fieldset { border: 0; padding: 0; margin: 0; }
	legend { color: var(--dim); font-size: 0.7rem; margin-bottom: 8px; }
	.moods { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip { display: inline-flex; margin: 0; cursor: pointer; text-transform: none; letter-spacing: 0; font-family: var(--body); font-size: 0.9rem; }
	.chip input { position: absolute; opacity: 0; pointer-events: none; }
	.chip span { border: 1.5px solid var(--line-2); border-radius: 999px; padding: 6px 12px; color: var(--dim); }
	.chip input:checked + span { background: var(--paper); border-color: var(--paper); color: var(--ink); }
	.chip input:focus-visible + span { outline: 2px solid var(--pink); }
	.check { display: flex; gap: 10px; align-items: flex-start; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-size: 0.95rem; color: var(--paper); font-weight: 400; cursor: pointer; }
	.check input { width: 20px; height: 20px; accent-color: var(--pink); flex: none; margin-top: 2px; }
	.actions { justify-content: flex-end; }
	.signed { color: var(--pink); margin: 0; }
	.rs { display: grid; gap: 8px; }
	.prefill { color: var(--warn); border-left: 3px solid var(--warn); padding-left: 8px; margin: 0; }
	.rs legend { font-family: var(--mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--paper); margin-bottom: 6px; }
	.yn { display: flex; gap: 18px; flex-wrap: wrap; }
	.opt { display: inline-flex; gap: 8px; align-items: center; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--paper); font-size: 0.95rem; cursor: pointer; }
	.opt input { width: 18px; height: 18px; accent-color: var(--pink); margin: 0; }
	textarea { width: 100%; box-sizing: border-box; }
	.summary { background: var(--ink); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 8px; }
	.summary p { margin: 0; }
	.summary dl { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; font-size: 0.9rem; }
	.summary dt { font-family: var(--mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); padding-top: 3px; }
	.summary dd { margin: 0; overflow-wrap: anywhere; }
	.commits { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.commits .check { font-size: 0.9rem; color: var(--dim); line-height: 1.5; }
	.ghost { color: var(--dim); }
	.small-btn { min-height: 36px; padding: 0 12px; font-size: 0.9rem; justify-self: start; }
	.unlist { margin-top: 10px; text-align: right; }
	@media (max-width: 560px) { .three { grid-template-columns: 1fr 1fr; } .three > div:first-child { grid-column: 1 / -1; } }
</style>
