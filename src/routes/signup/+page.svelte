<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import OAuthButtons from '#lib/components/OAuthButtons.svelte';
	import Turnstile from '#lib/components/Turnstile.svelte';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	let turnstile = $state<Turnstile>();
</script>

<svelte:head>
	<title>Sign up · AuxRiot</title>
</svelte:head>

<div class="auth card stack">
	<h1>Create your account</h1>
	<OAuthButtons providers={data.providers} next={data.next} verb="Sign up" />
	<form
		method="POST"
		class="stack"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				// Tokens are single-use: get a fresh one before they retry.
				if (result.type !== 'redirect') turnstile?.reset();
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
			<input type="checkbox" name="agree" required />
			<span>I'm 18 or older and agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span>
		</label>
		<label class="optin">
			<input type="checkbox" name="provider" />
			<span>I'm here to offer services too — mixing, mastering, custom beats. (You can still battle and judge.)</span>
		</label>
		<label class="optin">
			<input type="checkbox" name="news" />
			<span>Send me AuxRiot news — battles of the week, events, new features. Unsubscribe anytime.</span>
		</label>
		{#if data.turnstileSiteKey}
			<Turnstile bind:this={turnstile} siteKey={data.turnstileSiteKey} action="signup" />
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
