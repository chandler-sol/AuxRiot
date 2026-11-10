<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#0e0d0b" />
	<title>AuxRiot</title>
</svelte:head>

<header>
	<div class="container bar">
		<a href="/" class="logo display" aria-label="AuxRiot home">AUX<span>RIOT</span></a>
		<nav>
			{#if data.user}
				{#if data.user.isAdmin}<a class="mono navlink" href="/admin">Admin</a>{/if}
				<a class="mono navlink" href="/u/{data.user.username}">{data.user.username}</a>
				<form method="POST" action="/logout"><button class="link-btn">Out</button></form>
				<a class="btn primary beat" href="/battles/new">+ Beat</a>
			{:else}
				<a class="mono navlink" href="/login">Log in</a>
				<a class="btn primary beat" href="/signup">Join</a>
			{/if}
		</nav>
	</div>
</header>

<main class="container">
	{@render children()}
</main>

<footer class="container mono">
	<a href="/rules">Rules &amp; voting</a>
	<span>·</span>
	<a href="/dmca">DMCA / copyright</a>
</footer>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		background: rgba(14, 13, 11, 0.9);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--line);
	}
	.bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 10px; padding-bottom: 10px; }
	.logo { font-size: 1.85rem; color: var(--paper); text-decoration: none; letter-spacing: 0.02em; }
	.logo span { color: var(--pink); }
	nav { display: flex; align-items: center; gap: 14px; min-width: 0; }
	.navlink { color: var(--dim); text-decoration: none; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.navlink:hover { color: var(--paper); }
	.beat { min-height: 38px; padding: 2px 14px 0; font-size: 1.05rem; }
	footer { display: flex; gap: 10px; justify-content: center; padding-top: 40px; padding-bottom: 40px; color: var(--muted); }
	footer a { color: var(--muted); text-decoration: none; }
	footer a:hover { color: var(--paper); }
</style>
