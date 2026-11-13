<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { formatSize } from '#lib/store.ts';

	let {
		listingId,
		kind,
		current,
		accept,
		label,
		hint = ''
	}: {
		listingId: string;
		kind: 'file' | 'stems';
		current: { name: string; size: number } | null;
		accept: string;
		label: string;
		hint?: string;
	} = $props();

	let progress = $state<number | null>(null);
	let error = $state('');
	let input = $state<HTMLInputElement>();

	async function api(body: object) {
		const r = await fetch('/api/store/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const data = await r.json().catch(() => ({}));
		if (!r.ok) throw new Error(data.error || data.message || 'Upload failed.');
		return data;
	}

	async function upload(file: File) {
		error = '';
		progress = 0;
		let uploadId = '';
		try {
			const start = await api({ op: 'start', listingId, kind, fileName: file.name, size: file.size });
			uploadId = start.uploadId;
			const partBytes: number = start.partBytes;
			const parts: { partNumber: number; etag: string }[] = [];
			const total = Math.ceil(file.size / partBytes);
			for (let i = 0; i < total; i++) {
				const chunk = file.slice(i * partBytes, Math.min(file.size, (i + 1) * partBytes));
				let attempt = 0;
				for (;;) {
					const r = await fetch(`/api/store/upload?uploadId=${encodeURIComponent(uploadId)}&part=${i + 1}`, { method: 'PUT', body: chunk });
					const data = await r.json().catch(() => ({}));
					if (r.ok) {
						parts.push({ partNumber: data.partNumber, etag: data.etag });
						break;
					}
					// The server rejects a file that isn't really WAV/MP3/zip on the first chunk; don't retry that.
					if (r.status === 400 || ++attempt >= 3) throw new Error(data.error || data.message || 'Upload failed.');
					await new Promise((res) => setTimeout(res, 800 * attempt));
				}
				progress = Math.round(((i + 1) / total) * 100);
			}
			await api({ op: 'complete', uploadId, parts });
			uploadId = '';
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed.';
			if (uploadId) api({ op: 'abort', uploadId }).catch(() => {});
		} finally {
			progress = null;
			if (input) input.value = '';
		}
	}
</script>

<div class="up">
	<p class="lbl mono">{label}</p>
	{#if current}
		<div class="cur">
			<span class="name">{current.name}</span>
			<span class="mono muted">{formatSize(current.size)}</span>
		</div>
	{/if}
	{#if progress !== null}
		<div class="bar" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><span style:width="{progress}%"></span></div>
		<p class="mono small muted">Uploading… {progress}% — keep this page open.</p>
	{:else}
		<label class="btn pick">
			{current ? 'Replace file' : 'Choose file'}
			<input bind:this={input} type="file" {accept} onchange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) upload(f); }} />
		</label>
	{/if}
	{#if hint}<p class="small muted">{hint}</p>{/if}
	{#if error}<p class="error small">{error}</p>{/if}
</div>

<style>
	.up { display: grid; gap: 8px; }
	.lbl { margin: 0; color: var(--dim); font-size: 0.7rem; }
	.cur { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; background: var(--ink); border: 1.5px solid var(--line-2); border-radius: var(--radius); padding: 10px 12px; }
	.name { overflow-wrap: anywhere; }
	.pick { position: relative; overflow: hidden; justify-self: start; }
	.pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.bar { height: 10px; background: var(--ink); border: 1.5px solid var(--line-2); border-radius: 999px; overflow: hidden; }
	.bar span { display: block; height: 100%; background: var(--pink); transition: width 0.2s; }
	p { margin: 0; }
</style>
