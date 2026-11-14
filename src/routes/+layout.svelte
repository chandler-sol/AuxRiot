<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';

	let { children, data }: LayoutProps = $props();
	let menuOpen = $state(false);
	let verifyMsg = $state('');
	// Pages that use the wide desktop layout; forms and reading pages stay narrow.
	const WIDE = new Set(['/', '/battles', '/battles/[id]', '/u/[username]', '/admin/news', '/store', '/services']);
	let wide = $derived(WIDE.has(page.route.id ?? ''));

	// "Finish judging" bar: unfinished multi-beat ballots, minus the battle being viewed.
	const ballots = $derived((data.ballots ?? []).filter((x) => page.params.id !== x.id || page.route.id !== '/battles/[id]'));
	const leftLabel = (ms: number) => {
		const m = Math.max(1, Math.round(ms / 60_000));
		return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
	};

	// Pages can override the share preview by returning `og: { title, description }` from their load.
	const SITE = 'https://auxriot.com';
	let og = $derived({
		title: (page.data.og as { title?: string } | undefined)?.title ?? 'AuxRiot · 1v1 beat battles',
		description:
			(page.data.og as { description?: string } | undefined)?.description ??
			'Post a beat. Get called out. A crowd that actually listened decides who hit harder. No likes, no algorithm.',
		url: SITE + page.url.pathname,
		image: SITE + ((page.data.og as { image?: string } | undefined)?.image ?? '/og-v2.png')
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
	<!-- Cloudflare Web Analytics: cookieless, no personal data. Production only. -->
	{#if page.url.hostname === 'auxriot.com'}
		<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={'{"token": "474e3f7ccd374aa288d4407a913e5e74"}'}></script>
	{/if}
</svelte:head>

{#if data.beta}<div class="betabar mono">Beta · prototype site · nothing here is real</div>{/if}
<header>
	<div class="container wide bar">
		<a href="/" class="logo display" aria-label="AuxRiot home">AUX<span>RIOT</span></a>
		<nav>
			<a class="mono navlink storelink" href="/store">Store</a>
			{#if data.user}
				<details class="account" bind:open={menuOpen} bind:this={menuEl}>
					<summary class="acct" aria-label="Account menu for {data.user.username}">
						<Avatar username={data.user.username} avatarKey={data.user.avatarKey} color={data.user.color} size={30} />
						<span class="mono uname">{data.user.username}</span>
						<span class="mono chip">{data.user.credits.toLocaleString()} cr</span>
						{#if data.unread}<span class="mono badge" aria-label="{data.unread} unread conversations">{data.unread}</span>{/if}
						<svg class="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
					</summary>
					<div class="menu">
						<div class="menu-head">
							<span class="display mh-name">{data.user.username}</span>
							<a class="mono mh-cr" href="/credits" onclick={() => (menuOpen = false)}>{data.user.credits.toLocaleString()} credits →</a>
						</div>
						<a href="/u/{data.user.username}" onclick={() => (menuOpen = false)}>My profile</a>
						<a href="/messages" onclick={() => (menuOpen = false)}>Messages{#if data.unread}<span class="mono badge inmenu">{data.unread}</span>{/if}</a>
						<a href="/credits" onclick={() => (menuOpen = false)}>Credits</a>
						<a href="/store" onclick={() => (menuOpen = false)}>Store &amp; services</a>
						<a href="/settings/services" onclick={() => (menuOpen = false)}>Your services</a>
						<a href="/settings/profile" onclick={() => (menuOpen = false)}>Edit profile</a>
						{#if data.user.isMod}
							<a href="/admin" onclick={() => (menuOpen = false)}>{data.user.isAdmin ? 'Admin' : 'Mod tools'}</a>
							<a href="/admin/reports" onclick={() => (menuOpen = false)}>Reports</a>
							<a href="/admin/users" onclick={() => (menuOpen = false)}>Users</a>
						{/if}
						<form method="POST" action="/logout"><button class="logout">Log out</button></form>
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

{#if ballots.length}
	<div class="ballotbar">
		{#each ballots as x (x.id)}
			{@const ms = x.endsAt - Date.now()}
			<a href="/battles/{x.id}" class:urgent={ms < 3_600_000}>
				<span class="mono k">{ms < 3_600_000 ? 'Last call' : 'Finish judging'}</span>
				<span class="t">{x.title}</span>
				<span class="mono m">{x.scored}/{x.rounds} rounds · closes in {leftLabel(ms)} →</span>
			</a>
		{/each}
	</div>
{/if}
<main class="container" class:wide>
	{@render children()}
</main>

<footer class="container wide mono">
	<a href="/rules">Rules &amp; voting</a>
	<span>·</span>
	<a href="/faq">FAQ</a>
	<span>·</span>
	<a href="/dmca">DMCA / copyright</a>
	<span>·</span>
	<a href="/terms">Terms</a>
	<span>·</span>
	<a href="/privacy">Privacy</a>
</footer>

<style>
	.ballotbar { display: grid; border-bottom: 1.5px solid var(--line-2); }
	.ballotbar a {
		display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 8px 16px; text-decoration: none;
		background: var(--paper); color: var(--ink); border-bottom: 1px solid #d8cfc0;
	}
	.ballotbar a.urgent { background: var(--pink); color: var(--ink); }
	.ballotbar .k { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
	.ballotbar .t { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
	.ballotbar .m { font-size: 0.7rem; margin-left: auto; }
	.betabar { background: var(--warn); color: var(--ink); text-align: center; padding: 5px 10px 4px; font-size: 0.66rem; font-weight: 700; }
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
	/* Phones with an account menu: Store lives in the menu instead. */
	@media (max-width: 480px) { nav:has(.account) .storelink { display: none; } }
	.account { position: relative; }
	.acct {
		list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px;
		min-height: 44px; padding: 4px 10px 4px 4px; border: 1.5px solid var(--line-2); border-radius: var(--radius);
		color: var(--paper); transition: border-color 0.15s, background 0.15s;
	}
	.acct::-webkit-details-marker { display: none; }
	.acct:hover, .account[open] .acct { border-color: var(--paper); background: var(--ink-2); }
	.uname { color: var(--paper); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.chip { color: var(--pink); white-space: nowrap; }
	.badge { background: var(--pink); color: var(--ink); border-radius: 999px; min-width: 20px; height: 20px; padding: 0 6px; display: inline-grid; place-items: center; font-size: 0.66rem; font-weight: 700; }
	.badge.inmenu { margin-left: 10px; }
	.chev { flex: none; transition: transform 0.15s; }
	.account[open] .chev { transform: rotate(180deg); }
	@media (max-width: 560px) { .uname { display: none; } }
	.menu {
		position: absolute; right: 0; top: calc(100% + 10px); width: 280px;
		display: flex; flex-direction: column;
		background: var(--ink-2); border: 1.5px solid var(--line-2); border-radius: var(--radius);
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.6); padding: 6px 0; z-index: 30;
	}
	@media (max-width: 560px) {
		.menu { position: fixed; left: 12px; right: 12px; top: 64px; width: auto; }
	}
	.menu-head { display: flex; flex-direction: column; gap: 4px; padding: 14px 20px 14px; border-bottom: 1.5px dashed var(--line-2); margin-bottom: 4px; }
	.mh-name { font-size: 1.8rem; line-height: 1; color: var(--paper); overflow-wrap: anywhere; }
	.mh-cr { color: var(--pink); text-decoration: none; font-size: 0.75rem; }
	.menu a:not(.mh-cr), .menu .logout {
		display: flex; align-items: center; justify-content: flex-start; width: 100%; min-height: 52px; padding: 0 20px; text-align: left;
		color: var(--paper); text-decoration: none; background: none; border: 0; border-radius: 0;
		font-family: var(--display); font-size: 1.3rem; font-weight: 400; letter-spacing: 0.04em; text-transform: uppercase;
	}
	.menu a:not(.mh-cr):hover, .menu .logout:hover { background: var(--ink-3); color: var(--pink); }
	.menu form { border-top: 1.5px dashed var(--line-2); margin-top: 4px; padding-top: 4px; }
	.menu .logout { color: var(--dim); }
	.verify-bar { background: var(--paper); color: var(--ink); }
	.vb { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 10px; padding-bottom: 9px; flex-wrap: wrap; }
	.vb .mono { color: var(--ink); }
	.vb .link-btn { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
	.vb .link-btn:hover { color: var(--pink); }
	.beat { min-height: 38px; padding: 2px 14px 0; font-size: 1.05rem; }
	footer { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; padding-top: 40px; padding-bottom: 40px; color: var(--muted); }
	footer a { color: var(--muted); text-decoration: none; }
	footer a:hover { color: var(--paper); }
</style>
