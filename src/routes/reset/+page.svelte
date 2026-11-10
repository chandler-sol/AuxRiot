<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>New password · AuxRiot</title></svelte:head>

<div class="auth">
	<p class="mono muted">Password reset</p>
	{#if data.valid}
		<h1>New <span>password.</span></h1>
		<form
			method="POST"
			class="stack"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			<input type="hidden" name="token" value={data.token} />
			<div>
				<label for="password">New password</label>
				<input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
			</div>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<button class="primary" disabled={busy}>{busy ? 'Saving…' : 'Save and log in'}</button>
		</form>
		<p class="muted small">You'll be signed out on every other device.</p>
	{:else}
		<h1>That link is <span>dead.</span></h1>
		<p class="muted">Reset links work for 1 hour and only once.</p>
		<a class="btn primary" href="/forgot">Send a new link</a>
	{/if}
</div>

<style>
	.auth { max-width: 420px; margin: 24px 0; }
	h1 { font-size: clamp(2.8rem, 12vw, 4.2rem); line-height: 0.9; }
	h1 span { color: var(--pink); }
	form button { width: 100%; }
	p { margin: 0 0 16px; }
</style>
