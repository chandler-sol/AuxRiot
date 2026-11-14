<script lang="ts">
	import { enhance } from '$app/forms';
	import BeatSet from '#lib/components/BeatSet.svelte';
	import { FORMATS, type Rounds } from '#lib/battleformat.ts';
	import CopyrightNotice from '#lib/components/CopyrightNotice.svelte';
	import type { PreparedAudio } from '#lib/audio-prep.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let rounds = $state<Rounds>(1);
	let slots = $state<{ id: number; prepared: PreparedAudio | null }[]>([]);
	let hours = $state<number>(48);
	let busy = $state(false);
	const fmt = $derived(FORMATS[rounds]);
	const ready = $derived(slots.length === rounds && slots.every((s) => s.prepared));
	$effect.pre(() => {
		if (!(fmt.hours as readonly number[]).includes(hours)) hours = fmt.defaultHours;
	});
</script>

<svelte:head><title>New battle · AuxRiot</title></svelte:head>

<p class="mono muted kicker">New battle — corner A</p>
<h1 class="headline">Drop a <span>beat.</span></h1>
<p class="muted lede">The first producer to answer it becomes your opponent, and voting starts right away.</p>

<form
	method="POST"
	enctype="multipart/form-data"
	class="stack form"
	use:enhance={({ formData, cancel }) => {
		if (!ready) return cancel();
		slots.forEach((sl, i) => {
			formData.set(`audio_${i}`, sl.prepared!.blob, `round-${i + 1}.mp3`);
			formData.set(`peaks_${i}`, JSON.stringify(sl.prepared!.peaks));
		});
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<div>
		<label for="title">Battle title</label>
		<input id="title" name="title" type="text" minlength="3" maxlength="80" required placeholder="e.g. Dusty soul chops, 90 BPM" />
	</div>

	<div>
		<span class="lab">Format</span>
		<div class="hours" role="radiogroup" aria-label="Format">
			{#each [1, 3, 5] as n (n)}
				<label class="hour"><input type="radio" name="rounds" value={n} bind:group={rounds} /><span class="display">{FORMATS[n as Rounds].label}</span></label>
			{/each}
		</div>
		{#if rounds > 1}
			<p class="small muted fmt-note">
				{rounds} beats each, played head-to-head in the order you set. Best total score across all {rounds} rounds wins — and credits pay ×{fmt.multiplier}.
				Challengers only hear a 10-second taste of round 1 until they answer, and must answer with {rounds} beats of their own.
			</p>
		{/if}
	</div>

	<BeatSet {rounds} bind:slots />

	<div>
		<span class="lab">Voting window — starts when a challenger answers</span>
		<div class="hours" role="radiogroup" aria-label="Voting window">
			{#each fmt.hours as h (h)}
				<label class="hour"><input type="radio" name="vote_hours" value={h} bind:group={hours} /><span class="display">{h}h</span></label>
			{/each}
		</div>
	</div>

	<label class="sell">
		<input type="checkbox" name="sell" />
		<span><strong>Sell {rounds > 1 ? 'these beats' : 'this beat'} too</strong> — list {rounds > 1 ? 'them' : 'it'} as exclusives in the store. You'll set prices and upload full files next. Buyers can check out once the battle ends.</span>
	</label>
	<CopyrightNotice />

	{#if form?.error}<p class="error">{form.error}</p>{/if}
	<button class="primary" disabled={!ready || busy}>{busy ? 'Uploading…' : rounds > 1 ? `Post ${fmt.label.toLowerCase()}` : 'Post battle'}</button>
</form>

<style>
	.sell { display: flex; gap: 10px; align-items: flex-start; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-size: 0.95rem; color: var(--dim); font-weight: 400; cursor: pointer; }
	.sell strong { color: var(--paper); }
	.sell input { width: 20px; height: 20px; accent-color: var(--pink); flex: none; margin-top: 2px; }
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(3.2rem, 16vw, 5.5rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.lede { margin: 0 0 20px; }
	.form button.primary { width: 100%; }
	.lab { display: block; font-family: var(--mono); font-weight: 700; font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); margin-bottom: 6px; }
	.hours { display: flex; gap: 8px; flex-wrap: wrap; }
	.fmt-note { margin: 8px 0 0; }
	.hour { position: relative; margin: 0; cursor: pointer; }
	.hour input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
	.hour span {
		display: block; padding: 8px 18px 6px; border: 1.5px solid var(--line-2); border-radius: var(--radius);
		font-size: 1.3rem; color: var(--dim); letter-spacing: 0.04em;
	}
	.hour input:checked + span { background: var(--paper); border-color: var(--paper); color: var(--ink); }
	.hour input:focus-visible + span { outline: 2px solid var(--paper); outline-offset: 2px; }
</style>
