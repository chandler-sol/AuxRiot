<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Confirm email · AuxRiot</title></svelte:head>

<div class="box">
	{#if form?.resent}
		<p class="mono muted">Sent</p>
		<h1>Check your <span>inbox.</span></h1>
		<p class="muted">A fresh confirmation link is on its way. It works for 48 hours.</p>
	{:else if form?.resendError}
		<h1>Hold <span>up.</span></h1>
		<p class="error">{form.resendError}</p>
	{:else if data.state === 'verified'}
		<p class="mono muted">Email confirmed</p>
		<h1>You're <span>verified.</span></h1>
		<p class="muted">Voting is unlocked. Go hear some beats and pick a winner.</p>
		<a class="btn primary" href="/battles">See live battles</a>
	{:else if data.state === 'invalid'}
		<p class="mono muted">Link expired</p>
		<h1>That link is <span>dead.</span></h1>
		<p class="muted">It was already used, replaced by a newer one, or it expired. Log in and request a new one from the banner at the top.</p>
		<a class="btn" href="/battles">Back to battles</a>
	{:else}
		<h1>Missing <span>link.</span></h1>
		<p class="muted">Open the confirmation link from your email.</p>
	{/if}
</div>

<style>
	.box { max-width: 520px; margin: 32px 0; }
	h1 { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; }
	h1 span { color: var(--pink); }
	p { margin: 0 0 18px; }
</style>
