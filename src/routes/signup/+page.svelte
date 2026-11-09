<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>Sign up · AuxRiot</title>
	{#if data.turnstileSiteKey}
		<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
	{/if}
</svelte:head>

<div class="auth card stack">
	<h1>Create your account</h1>
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
			<label for="username">Username</label>
			<input id="username" name="username" type="text" autocomplete="username" required value={form?.username ?? ''} />
		</div>
		<div>
			<label for="email">Email</label>
			<input id="email" name="email" type="email" autocomplete="email" required value={form?.email ?? ''} />
		</div>
		<div>
			<label for="password">Password</label>
			<input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
		</div>
		{#if data.turnstileSiteKey}
			<div class="cf-turnstile" data-sitekey={data.turnstileSiteKey} data-theme="dark"></div>
		{/if}
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button class="primary" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
	</form>
	<p class="muted small">
		New accounts can battle right away. Voting unlocks after your account is a week old — that keeps battles fair.
	</p>
	<p class="small">Already have an account? <a href="/login">Log in</a></p>
</div>

<style>
	.auth { max-width: 420px; margin: 24px auto; }
</style>
