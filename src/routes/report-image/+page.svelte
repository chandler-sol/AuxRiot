<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Remove a private image · AuxRiot</title></svelte:head>

<article class="stack">
	<section class="card stack">
		<h1>Remove a private image</h1>
		<p>
			If an intimate photo, video or realistic digital forgery of you was shared on AuxRiot without your consent, you or your authorized representative can ask us to remove it.
			You don't need an account. <strong>Please don't send us a copy of the image.</strong>
		</p>
		<p>For a valid request we remove it as soon as possible and <strong>within 48 hours</strong>, and make reasonable efforts to find and remove identical copies. This is separate from copyright complaints.</p>
		<p class="small muted">Prefer email? Write to hello@auxriot.com with the subject “Private image removal”.</p>
	</section>

	{#if form?.sent}
		<section class="card"><p class="success">Received. We're on it and will contact you at the details you gave.</p></section>
	{:else}
		<form method="POST" class="card stack" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
			<div>
				<label for="location">Where is it? (link, profile or message location)</label>
				<textarea id="location" name="location" rows="2" maxlength="1000" required value={form?.location ?? ''}></textarea>
			</div>
			<div>
				<label for="details">What happened (and why it was shared without consent)</label>
				<textarea id="details" name="details" rows="4" maxlength="3000" required value={form?.details ?? ''}></textarea>
			</div>
			<div>
				<label for="contact">How we can reach you (email or phone)</label>
				<input id="contact" name="contact" type="text" maxlength="300" required value={form?.contact ?? ''} />
			</div>
			<label class="check"><input type="checkbox" name="on_behalf" /> I'm an authorized representative of the person shown.</label>
			<label class="check"><input type="checkbox" name="good_faith" required /> I have a good-faith belief that this was published without the depicted person's consent.</label>
			<div>
				<label for="signature">Signature (type your full name)</label>
				<input id="signature" name="signature" type="text" maxlength="200" required value={form?.signature ?? ''} />
			</div>
			{#if form?.error}<p class="error small">{form.error}</p>{/if}
			<button class="primary" disabled={busy}>{busy ? 'Sending…' : 'Send removal request'}</button>
		</form>
	{/if}
</article>

<style>
	textarea, input[type='text'] { width: 100%; box-sizing: border-box; }
	.check { display: flex; gap: 10px; align-items: flex-start; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--paper); font-size: 0.95rem; cursor: pointer; }
	.check input { width: 20px; height: 20px; accent-color: var(--pink); flex: none; margin-top: 2px; }
	button { justify-self: start; }
</style>
