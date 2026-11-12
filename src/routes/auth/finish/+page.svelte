<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Pick your name · AuxRiot</title></svelte:head>

<div class="auth card stack">
	<p class="mono muted small">Connected with {data.provider} ✓</p>
	<h1>Pick your producer name</h1>
	<form method="POST" class="stack" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
		<div>
			<label for="username">Username</label>
			<input id="username" name="username" type="text" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" autocomplete="username" value={form?.username ?? data.suggested} />
			<p class="small muted">3–20 letters, numbers or underscores. This is how you show up on battles.</p>
		</div>
		<div>
			<label for="email">Email</label>
			{#if data.emailLocked}
				<input id="email" type="email" value={data.email} disabled />
				<p class="small muted">Confirmed by {data.provider} — you can vote right away.</p>
			{:else}
				<input id="email" name="email" type="email" required value={form?.email ?? data.email} />
				<p class="small muted">We'll send a link to confirm it (needed to vote).</p>
			{/if}
		</div>
		<label class="optin"><input type="checkbox" name="agree" required /> <span>I'm 18 or older and agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label>
		<label class="optin"><input type="checkbox" name="news" /> <span>Send me AuxRiot news (a few emails a month at most)</span></label>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button class="primary" disabled={busy}>{busy ? 'Creating…' : 'Start battling'}</button>
	</form>
</div>

<style>
	.auth { max-width: 420px; margin: 24px auto; }
	.optin { display: flex; gap: 10px; align-items: flex-start; font-family: var(--body); text-transform: none; letter-spacing: 0; font-size: 0.95rem; color: var(--paper); font-weight: 400; }
	.optin input { width: 20px; height: 20px; accent-color: var(--pink); flex: none; margin-top: 2px; }
</style>
