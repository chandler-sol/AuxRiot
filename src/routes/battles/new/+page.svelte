<script lang="ts">
	import { enhance } from '$app/forms';
	import Uploader from '#lib/components/Uploader.svelte';
	import CopyrightNotice from '#lib/components/CopyrightNotice.svelte';
	import type { PreparedAudio } from '#lib/audio-prep.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let prepared = $state<PreparedAudio | null>(null);
	let busy = $state(false);
</script>

<svelte:head><title>New battle · BeatBattle</title></svelte:head>

<h1>Start a battle</h1>
<p class="muted">Upload your beat. The first producer to answer it becomes your opponent, and voting starts right away.</p>

<form
	method="POST"
	enctype="multipart/form-data"
	class="card stack"
	use:enhance={({ formData, cancel }) => {
		if (!prepared) return cancel();
		formData.set('audio', prepared.blob, 'beat.mp3');
		formData.set('peaks', JSON.stringify(prepared.peaks));
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

	<Uploader bind:prepared />

	<div>
		<label for="vote_hours">Voting window (starts when a challenger answers)</label>
		<select id="vote_hours" name="vote_hours">
			<option value="24">24 hours</option>
			<option value="48" selected>48 hours</option>
		</select>
	</div>

	<CopyrightNotice />

	{#if form?.error}<p class="error">{form.error}</p>{/if}
	<button class="primary" disabled={!prepared || busy}>{busy ? 'Uploading…' : 'Post battle'}</button>
</form>
