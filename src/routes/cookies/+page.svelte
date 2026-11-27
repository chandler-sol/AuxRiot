<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Cookies · AuxRiot</title></svelte:head>

<article class="card stack">
	<h1>Cookies</h1>
	<p>AuxRiot uses only a few cookies, and none for advertising or cross-site tracking:</p>
	<ul>
		<li><strong>Login session</strong>: keeps you signed in.</li>
		<li><strong>Device ID</strong>: a random identifier that helps us catch vote rigging and duplicate accounts.</li>
		<li><strong>Google or Discord sign-in</strong>: short-lived, only while you sign in with them.</li>
	</ul>
	<p>We can also use the device ID to count battle views (one view per device). {data.required ? 'Where you are, that needs your permission, and it stays off until you agree.' : ''}</p>
	<p class="mono small">View counting: <strong>{data.choice === 'yes' ? 'allowed' : data.choice === 'no' ? 'off' : data.required ? 'off (not asked yet)' : 'on'}</strong></p>
	<div class="row">
		<form method="POST" action="?/allow" use:enhance><button class="primary">Allow view counting</button></form>
		<form method="POST" action="?/decline" use:enhance><button>Turn it off</button></form>
	</div>
	{#if form?.ok}<p class="success small">{form.ok}</p>{/if}
	<p class="small muted">Site statistics come from Cloudflare Web Analytics, which uses no cookies. See the <a href="/privacy">Privacy Policy</a> §5.</p>
</article>

<style>
	ul { display: grid; gap: 6px; padding-left: 20px; margin: 0; line-height: 1.5; }
	.row { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
