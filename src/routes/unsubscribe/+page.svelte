<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Battle emails · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Email preferences</p>
{#if form?.done}
	<h1 class="headline">You're <span>off.</span></h1>
	<p>No more {data.kind === 'messages' ? 'message' : 'battle'} alerts. Account emails (password resets) still come through. Changed your mind? Turn them back on in <a href="/settings/profile">settings</a>.</p>
{:else if data.ok}
	<h1 class="headline">Stop {data.kind === 'messages' ? 'message' : 'battle'} <span>emails?</span></h1>
	<p class="muted">{data.kind === 'messages' ? "You won't get an email when someone messages you (they'll still be in your inbox)." : "You won't hear when someone answers your battle or when results are in."}</p>
	<form method="POST" use:enhance><button class="primary">Turn off {data.kind === 'messages' ? 'message' : 'battle'} alerts</button></form>
{:else}
	<h1 class="headline">Link <span>expired.</span></h1>
	<p>Manage your emails in <a href="/settings/profile">settings</a>.</p>
{/if}

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(2.8rem, 13vw, 4.4rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
</style>
