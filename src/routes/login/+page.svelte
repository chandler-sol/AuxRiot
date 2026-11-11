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
		{#if form?.suspended}
			<div class="suspended">
				<p class="display">Account suspended</p>
				<p>{form.suspended}</p>
				<p class="small muted">You can't log in, post, vote or comment while suspended. Think this is a mistake? Reply to any AuxRiot email.</p>
			</div>
		{/if}
		<button class="primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
	</form>
	<p class="small"><a href="/forgot">Forgot password?</a> · New here? <a href="/signup">Create an account</a></p>
</div>

<style>
	.suspended { border: 1.5px solid #ff5a4e; border-radius: var(--radius); padding: 12px 14px; }
	.suspended .display { color: #ff5a4e; font-size: 1.4rem; margin: 0 0 4px; }
	.suspended p { margin: 0 0 6px; }
	.auth { max-width: 420px; margin: 24px auto; }
</style>
