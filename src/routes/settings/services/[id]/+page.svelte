<script lang="ts">
	import { enhance } from '$app/forms';
	import Uploader from '#lib/components/Uploader.svelte';
	import ServiceCard from '#lib/components/ServiceCard.svelte';
	import type { PreparedAudio } from '#lib/audio-prep.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = $derived(data.service);
	// Uploader hands back an encoded MP3 + waveform, same as battle uploads (2:00 max, stream-only).
	let after = $state<PreparedAudio | null>(null);
	let before = $state<PreparedAudio | null>(null);
	let uploading = $state(false);
	let sampleTitle = $state('');
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>{s.title} · Your services</title></svelte:head>

<p class="mono muted kicker"><a href="/settings/services">← Your services</a></p>
<h1 class="headline">{data.category?.label ?? 'Service'}</h1>
<p class="mono status" class:live={s.status === 'active'}>{s.status === 'active' ? 'Live on the Services page' : 'Paused — not visible yet'}</p>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

<form method="POST" action="?/save" class="card stack" use:enhance={keep}>
	<div><label for="title">Title</label><input id="title" name="title" type="text" maxlength="80" value={s.title} required /></div>
	<div>
		<label for="description">What you do</label>
		<textarea id="description" name="description" rows="4" maxlength="1200" placeholder="Your process, what you need from the client (stems, references), what they get back…">{s.description}</textarea>
	</div>
	<div class="three">
		<div><label for="price">Starting at ($)</label><input id="price" name="price" type="text" inputmode="decimal" value={s.priceFromCents / 100} /></div>
		<div><label for="turnaround">Turnaround (days)</label><input id="turnaround" name="turnaround" type="text" inputmode="numeric" value={s.turnaroundDays} /></div>
		<div><label for="revisions">Revisions</label><input id="revisions" name="revisions" type="text" inputmode="numeric" value={s.revisions} /></div>
	</div>
	<p class="small muted">"Starting at" is the price shown on your card — you'll quote the exact price for each job. AuxRiot's fee on paid jobs is 20%, plus card processing (2.9% + 30¢), same as beats.</p>
	<div class="row actions">
		<button>Save</button>
		{#if s.status === 'active'}
			<button name="go" value="pause">Pause</button>
		{:else}
			<button class="primary" name="go" value="live">Save &amp; go live</button>
		{/if}
	</div>
</form>

<section class="card stack">
	<h2>Samples ({s.samples.length}/{data.maxSamples})</h2>
	<p class="small muted">
		Stream-only, like battle beats — there's no download button. Up to 2:00 each.
		{#if data.category?.beforeAfter}Add a <strong>before</strong> version so buyers can flip between the raw track and your work.{/if}
	</p>
	{#each s.samples as smp (smp.id)}
		<div class="smp">
			<span>{smp.title}{smp.before ? ' · before/after' : ''}</span>
			<form method="POST" action="?/deleteSample" use:enhance={keep}>
				<input type="hidden" name="sample_id" value={smp.id} />
				<button class="link-btn">Remove</button>
			</form>
		</div>
	{/each}
	{#if s.samples.length < data.maxSamples}
		<form
			method="POST"
			action="?/addSample"
			enctype="multipart/form-data"
			class="stack add"
			use:enhance={({ formData, cancel }) => {
				if (!after) return cancel();
				formData.set('audio', after.blob, 'after.mp3');
				formData.set('peaks', JSON.stringify(after.peaks));
				if (before) {
					formData.set('before_audio', before.blob, 'before.mp3');
					formData.set('before_peaks', JSON.stringify(before.peaks));
				}
				uploading = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					uploading = false;
					if (result.type === 'success') { after = null; before = null; sampleTitle = ''; }
				};
			}}
		>
			<div><label for="stitle">Sample title</label><input id="stitle" name="title" type="text" maxlength="80" placeholder="e.g. Trap vocal mix — client project" bind:value={sampleTitle} /></div>
			<div>
				<p class="lbl mono">{data.category?.beforeAfter ? 'After (your finished version)' : 'Audio'}</p>
				<Uploader bind:prepared={after} />
			</div>
			{#if data.category?.beforeAfter}
				<div>
					<p class="lbl mono">Before (raw version, optional)</p>
					<Uploader bind:prepared={before} />
				</div>
			{/if}
			{#if form?.sampleError}<p class="error small">{form.sampleError}</p>{/if}
			<button class="primary" disabled={!after || uploading}>{uploading ? 'Uploading…' : 'Add sample'}</button>
		</form>
	{/if}
</section>

<section class="preview">
	<h2>Preview</h2>
	<ServiceCard service={s} />
</section>

<form method="POST" action="?/remove" class="del" onsubmit={(e) => { if (!confirm('Delete this service?')) e.preventDefault(); }}>
	<button class="link-btn">Delete this service</button>
</form>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.6rem, 11vw, 4rem); line-height: 0.92; }
	.status { color: var(--dim); margin: 8px 0 14px; }
	.status.live { color: var(--pink); }
	section, form.card { margin-bottom: 16px; }
	.three { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 10px; }
	.three > div { min-width: 0; }
	.actions { justify-content: flex-end; }
	.smp { display: flex; justify-content: space-between; align-items: center; gap: 10px; border-top: 1px solid var(--line); padding-top: 8px; }
	.add { border-top: 1.5px dashed var(--line-2); padding-top: 12px; }
	.lbl { margin: 0 0 6px; color: var(--dim); font-size: 0.7rem; }
	.preview h2 { font-size: 1.3rem; }
	.del { text-align: right; }
	.del .link-btn { color: var(--muted); }
</style>
