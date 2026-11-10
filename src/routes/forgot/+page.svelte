<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Forgot password · AuxRiot</title></svelte:head>

<div class="auth">
	<p class="mono muted">Password reset</p>
	<h1>Locked <span>out?</span></h1>
	{#if form?.sent}
		<p class="muted">
			If that account exists, a reset link is on its way to its email. It works for 1 hour. Check spam if it doesn't show up.
		</p>
		<a class="btn" href="/login">Back to log in</a>
	{:else}
		<p class="muted">Enter your email or username and we'll send you a link to choose a new password.</p>
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
			<div>
				<label for="login">Email or username</label>
				<input id="login" name="login" type="text" autocomplete="username" required />
			</div>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<button class="primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
		</form>
	{/if}
</div>

<style>
	.auth { max-width: 420px; margin: 24px 0; }
	h1 { font-size: clamp(2.8rem, 12vw, 4.2rem); line-height: 0.9; }
	h1 span { color: var(--pink); }
	form button { width: 100%; }
</style>
