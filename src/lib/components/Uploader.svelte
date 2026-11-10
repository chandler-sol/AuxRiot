<script lang="ts">
	import { prepareAudio, MAX_SECONDS, type PreparedAudio } from '#lib/audio-prep.ts';
	import { clock } from '#lib/format.ts';
	import Player from './Player.svelte';

	let { prepared = $bindable(null) }: { prepared: PreparedAudio | null } = $props();

	let stage = $state('');
	let pct = $state<number | undefined>(undefined);
	let err = $state('');
	let previewUrl = $state('');
	let fileName = $state('');

	async function onFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		err = '';
		prepared = null;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
		fileName = file.name;
		if (file.size > 200 * 1024 * 1024) {
			err = 'That file is over 200 MB. Export a shorter or compressed version.';
			return;
		}
		try {
			const result = await prepareAudio(file, (s, p) => {
				stage = s;
				pct = p;
			});
			previewUrl = URL.createObjectURL(result.blob);
			prepared = result;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Something went wrong preparing your beat.';
		} finally {
			stage = '';
		}
	}
</script>

<div class="uploader stack">
	<label class="drop" class:busy={!!stage}>
		<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" onchange={onFile} disabled={!!stage} />
		{#if stage}
			<strong>{stage}{pct !== undefined ? ` ${pct}%` : ''}</strong>
			<span class="muted small">Processing happens on your device — nothing is uploaded yet.</span>
		{:else if prepared}
			<strong>✓ {fileName}</strong>
			<span class="muted small">Tap to choose a different file</span>
		{:else}
			<strong>Choose your beat</strong>
			<span class="muted small">MP3, WAV, M4A, FLAC… Max {clock(MAX_SECONDS)} — longer files get trimmed.</span>
		{/if}
	</label>

	{#if err}<p class="error">{err}</p>{/if}

	{#if prepared && previewUrl}
		{#if prepared.trimmed}
			<p class="warn small">
				Your file is {clock(prepared.originalDuration)} — only the first {clock(MAX_SECONDS)} will be used (with a short fade-out).
			</p>
		{/if}
		<div class="card preview">
			<Player src={previewUrl} peaks={prepared.peaks} durationMs={Math.round(prepared.duration * 1000)} label="preview" />
		</div>
	{/if}
</div>

<style>
	.drop {
		display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
		padding: 26px 16px; border: 1.5px solid var(--line-2); border-radius: var(--radius);
		background: var(--ink); cursor: pointer; transition: border-color 0.15s;
		text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; font-size: 1rem; color: var(--paper);
	}
	.drop strong { font-family: var(--display); font-weight: 400; font-size: 1.6rem; text-transform: uppercase; letter-spacing: 0.03em; }
	.drop:hover { border-color: var(--paper); }
	.drop.busy { cursor: progress; border-color: var(--pink); }
	.drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
	.warn { color: var(--warn); }
	.preview { background: var(--ink); }
</style>
