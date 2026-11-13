<script lang="ts">
	import { enhance } from '$app/forms';
	import StoreFileUpload from '#lib/components/StoreFileUpload.svelte';
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
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>Sell your beat · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/battles/{data.battle.id}">← "{data.battle.title}"</a></p>
<h1 class="headline">Sell this <span>beat.</span></h1>
<p class="status mono" class:on={l.status === 'listed'}>{STATUS[l.status] ?? l.status}</p>

<div class="explain">
	<p><strong>Exclusive only.</strong> One buyer gets the beat, then it's off the market for good. The battle stays up with a SOLD stamp.</p>
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

{#if locked}
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

		<section class="card stack">
			<label class="check">
				<input type="checkbox" name="attest" checked={l.attested} />
				<span>
					I own this beat and it has never been sold or leased anywhere else. If it contains samples, clearing them is up to me and the buyer —
					AuxRiot only removes beats on a valid DMCA notice.
				</span>
			</label>
		</section>

		{#if l.missing.length && l.status !== 'listed'}
			<p class="small muted">Still needed to go on sale: {l.missing.join(', ')}.</p>
		{/if}
		<div class="row actions">
			<button>Save {l.status === 'listed' ? 'changes' : 'draft'}</button>
			{#if l.status !== 'listed'}<button class="primary" name="publish" value="1">Put it on sale</button>{/if}
		</div>
	</form>
	{#if l.status === 'listed'}
		<form method="POST" action="?/unlist" use:enhance={keep} class="unlist"><button class="ghost">Take off the store</button></form>
	{/if}
{/if}

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.status { color: var(--dim); margin: 10px 0 12px; }
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
	.ghost { color: var(--dim); }
	.small-btn { min-height: 36px; padding: 0 12px; font-size: 0.9rem; justify-self: start; }
	.unlist { margin-top: 10px; text-align: right; }
	@media (max-width: 560px) { .three { grid-template-columns: 1fr 1fr; } .three > div:first-child { grid-column: 1 / -1; } }
</style>
