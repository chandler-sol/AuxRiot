<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#0d0d10" />
	<title>AuxRiot</title>
</svelte:head>

<header>
	<div class="container row spread">
		<a href="/" class="logo">Aux<span>Riot</span></a>
		<nav class="row">
			{#if data.user}
				<a class="btn primary small-btn" href="/battles/new">+ Battle</a>
				{#if data.user.isAdmin}<a href="/admin">Admin</a>{/if}
				<a href="/u/{data.user.username}">{data.user.username}</a>
				<form method="POST" action="/logout"><button class="link-btn">Log out</button></form>
			{:else}
				<a href="/login">Log in</a>
				<a class="btn primary small-btn" href="/signup">Sign up</a>
			{/if}
		</nav>
	</div>
</header>

<main class="container">
	{@render children()}
</main>

<footer class="container muted small">
	<a href="/rules">Rules &amp; voting</a> · <a href="/dmca">DMCA / copyright</a>
</footer>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		background: rgba(13, 13, 16, 0.88);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--border);
	}
	header .container { padding-top: 10px; padding-bottom: 10px; }
	.logo { font-weight: 900; font-size: 1.25rem; color: var(--text); letter-spacing: -0.02em; }
	.logo span { color: var(--accent); }
	.logo:hover { text-decoration: none; }
	nav { gap: 14px; font-size: 0.95rem; }
	.small-btn { min-height: 36px; padding: 0 14px; }
	footer { padding-top: 32px; padding-bottom: 32px; text-align: center; }
</style>
