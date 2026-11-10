<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Log in · AuxRiot</title></svelte:head>

<div class="auth card stack">
	<h1>Log in</h1>
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
			<label for="login">Username or email</label>
			<input id="login" name="login" type="text" autocomplete="username" required value={form?.login ?? ''} />
		</div>
		<div>
			<label for="password">Password</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required />
		</div>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button class="primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
	</form>
	<p class="small"><a href="/forgot">Forgot password?</a> · New here? <a href="/signup">Create an account</a></p>
</div>

<style>
	.auth { max-width: 420px; margin: 24px auto; }
</style>
