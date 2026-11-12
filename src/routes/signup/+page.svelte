<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import OAuthButtons from '#lib/components/OAuthButtons.svelte';

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
	<OAuthButtons providers={data.providers} next={data.next} verb="Sign up" />
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
		<label class="optin">
			<input type="checkbox" name="news" />
			<span>Send me AuxRiot news — battles of the week, events, new features. Unsubscribe anytime.</span>
		</label>
		{#if data.turnstileSiteKey}
			<div class="cf-turnstile" data-sitekey={data.turnstileSiteKey} data-theme="dark"></div>
		{/if}
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button class="primary" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
	</form>
	<p class="muted small">
		New accounts can battle right away.{#if data.voterWait}{' '}Voting unlocks once your account is {data.voterWait} old — that keeps battles fair.{/if}
	</p>
	<p class="small">Already have an account? <a href="/login{data.next ? `?next=${encodeURIComponent(data.next)}` : ''}">Log in</a></p>
</div>

<style>
	.auth { max-width: 420px; margin: 24px auto; }
	.optin { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-family: var(--body); font-size: 0.9rem; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--dim); }
	.optin input { width: 20px; height: 20px; flex: none; margin-top: 1px; accent-color: var(--pink); }
</style>
