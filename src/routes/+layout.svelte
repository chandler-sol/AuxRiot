<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';

	let { children, data }: LayoutProps = $props();
	let menuOpen = $state(false);
	// Pages that use the wide desktop layout; forms and reading pages stay narrow.
	const WIDE = new Set(['/', '/battles', '/battles/[id]', '/u/[username]']);
	let wide = $derived(WIDE.has(page.route.id ?? ''));
	let menuEl = $state<HTMLDetailsElement>();

	function closeOnOutside(e: MouseEvent) {
		if (menuOpen && menuEl && !menuEl.contains(e.target as Node)) menuOpen = false;
	}
	function closeOnEscape(e: KeyboardEvent) {
		if (e.key === 'Escape') menuOpen = false;
	}
</script>

<svelte:window onclick={closeOnOutside} onkeydown={closeOnEscape} />

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#0e0d0b" />
	<title>AuxRiot</title>
</svelte:head>

<header>
	<div class="container wide bar">
		<a href="/" class="logo display" aria-label="AuxRiot home">AUX<span>RIOT</span></a>
		<nav>
			{#if data.user}
				<details class="account" bind:open={menuOpen} bind:this={menuEl}>
					<summary class="mono navlink">{data.user.username} ▾</summary>
					<div class="menu">
						<a class="mono" href="/u/{data.user.username}" onclick={() => (menuOpen = false)}>My profile</a>
						<a class="mono" href="/settings/profile" onclick={() => (menuOpen = false)}>Edit profile</a>
						{#if data.user.isAdmin}<a class="mono" href="/admin" onclick={() => (menuOpen = false)}>Admin</a>{/if}
						<form method="POST" action="/logout"><button class="mono logout">Log out</button></form>
					</div>
				</details>
				<a class="btn primary beat" href="/battles/new">+ Beat</a>
			{:else}
				<a class="mono navlink" href="/login">Log in</a>
				<a class="btn primary beat" href="/signup">Join</a>
			{/if}
		</nav>
	</div>
</header>

<main class="container" class:wide>
	{@render children()}
</main>

<footer class="container wide mono">
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
	.account { position: relative; }
	.account summary { list-style: none; cursor: pointer; padding: 8px 0; }
	.account summary::-webkit-details-marker { display: none; }
	.account[open] summary { color: var(--paper); }
	.menu {
		position: absolute; right: 0; top: calc(100% + 8px); min-width: 180px;
		display: flex; flex-direction: column;
		background: var(--ink-2); border: 1px solid var(--line-2); border-radius: var(--radius);
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5); padding: 6px 0; z-index: 20;
	}
	.menu a, .menu .logout {
		display: block; width: 100%; text-align: left; padding: 12px 16px; min-height: 0;
		color: var(--dim); text-decoration: none; background: none; border: 0; border-radius: 0;
		font-family: var(--mono); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
	}
	.menu a:hover, .menu .logout:hover { background: var(--ink-3); color: var(--paper); }
	.menu form { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 4px; }
	.beat { min-height: 38px; padding: 2px 14px 0; font-size: 1.05rem; }
	footer { display: flex; gap: 10px; justify-content: center; padding-top: 40px; padding-bottom: 40px; color: var(--muted); }
	footer a { color: var(--muted); text-decoration: none; }
	footer a:hover { color: var(--paper); }
</style>
