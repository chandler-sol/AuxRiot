<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';

	let { children, data }: LayoutProps = $props();
	let menuOpen = $state(false);
	let verifyMsg = $state('');
	// Pages that use the wide desktop layout; forms and reading pages stay narrow.
	const WIDE = new Set(['/', '/battles', '/battles/[id]', '/u/[username]', '/admin/news']);
	let wide = $derived(WIDE.has(page.route.id ?? ''));

	// Pages can override the share preview by returning `og: { title, description }` from their load.
	const SITE = 'https://auxriot.com';
	let og = $derived({
		title: (page.data.og as { title?: string } | undefined)?.title ?? 'AuxRiot · 1v1 beat battles',
		description:
			(page.data.og as { description?: string } | undefined)?.description ??
			'Post a beat. Get called out. A crowd that actually listened decides who hit harder. No likes, no algorithm.',
		url: SITE + page.url.pathname,
		image: SITE + '/og-v2.png'
	});
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
	<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<meta name="theme-color" content="#0e0d0b" />
	<title>AuxRiot</title>
	<!-- Link previews (iMessage, Messenger, WhatsApp, Discord, Slack, X…) -->
	<meta name="description" content={og.description} />
	<meta property="og:site_name" content="AuxRiot" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={og.title} />
	<meta property="og:description" content={og.description} />
	<meta property="og:url" content={og.url} />
	<meta property="og:image" content={og.image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="AuxRiot — 1v1 beat battles. No likes. No algorithm. Just who hit harder." />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={og.title} />
	<meta name="twitter:description" content={og.description} />
	<meta name="twitter:image" content={og.image} />
	<link rel="canonical" href={og.url} />
</svelte:head>

<header>
	<div class="container wide bar">
		<a href="/" class="logo display" aria-label="AuxRiot home">AUX<span>RIOT</span></a>
		<nav>
			{#if data.user}
				<details class="account" bind:open={menuOpen} bind:this={menuEl}>
					<summary class="mono navlink">{data.user.username} <span class="cr">{data.user.credits.toLocaleString()} cr</span> ▾</summary>
					<div class="menu">
						<a class="mono" href="/u/{data.user.username}" onclick={() => (menuOpen = false)}>My profile</a>
						<a class="mono" href="/credits" onclick={() => (menuOpen = false)}>Credits · {data.user.credits.toLocaleString()}</a>
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

{#if data.user && !data.user.emailVerified && page.route.id !== '/verify'}
	<div class="verify-bar">
		<div class="container wide vb">
			<span class="mono">{verifyMsg || 'Confirm your email to unlock voting — check your inbox.'}</span>
			{#if !verifyMsg}
				<form
					method="POST"
					action="/verify?/resend"
					use:enhance={() =>
						async ({ result }) => {
							if (result.type === 'success') verifyMsg = 'Sent — check your inbox (and spam).';
							else if (result.type === 'failure') verifyMsg = String((result.data as { resendError?: string })?.resendError ?? 'Try again in a minute.');
						}}
				>
					<button class="link-btn">Resend link</button>
				</form>
			{/if}
		</div>
	</div>
{/if}

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
	.cr { color: var(--pink); margin-left: 6px; }
	@media (max-width: 420px) { .cr { display: none; } }
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
	.verify-bar { background: var(--paper); color: var(--ink); }
	.vb { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 10px; padding-bottom: 9px; flex-wrap: wrap; }
	.vb .mono { color: var(--ink); }
	.vb .link-btn { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
	.vb .link-btn:hover { color: var(--pink); }
	.beat { min-height: 38px; padding: 2px 14px 0; font-size: 1.05rem; }
	footer { display: flex; gap: 10px; justify-content: center; padding-top: 40px; padding-bottom: 40px; color: var(--muted); }
	footer a { color: var(--muted); text-decoration: none; }
	footer a:hover { color: var(--paper); }
</style>
