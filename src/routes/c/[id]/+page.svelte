<script lang="ts">
	import Player from '#lib/components/Player.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import ShareChallenge from '#lib/components/ShareChallenge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.challenge);
	const next = $derived(`/battles/${c.id}#answer`);
	const rec = $derived(`${c.creator.wins}-${c.creator.losses}${c.creator.ties ? `-${c.creator.ties}` : ''}`);
</script>

<svelte:head><title>{c.creator.username} wants smoke · AuxRiot</title></svelte:head>

<article class="flyer" style:--c={c.color}>
	<p class="mono kicker">Open challenge · {c.voteHours}h vote · first to answer takes it</p>
	<div class="who">
		<Avatar username={c.creator.username} avatarKey={c.creator.avatarKey} color={c.creator.color} size={64} />
		<div>
			<a class="mono rec" href="/u/{c.creator.username}">{rec} record →</a>
		</div>
	</div>
	<h1 class="headline"><span class="name">{c.creator.username}</span> wants smoke.</h1>
	<p class="title">"{c.title}"</p>

	<div class="player">
		<Player variant="full" src={c.src} peaks={c.peaks} durationMs={c.durationMs} name={c.creator.username} corner="Corner A" accent={c.color} previewSeconds={30} />
		<p class="mono muted small">30-second preview. Answer to hear the rest — and make them hear yours.</p>
	</div>

	{#if data.isCreator}
		<div class="mine">
			<p class="display">This is your challenge link.</p>
			<p class="muted small">Send it to a producer you want to battle. They hear 30 seconds, sign up, and answer in one go.</p>
			<ShareChallenge id={c.id} title={c.title} username={c.creator.username} />
		</div>
	{:else if data.loggedIn}
		<a class="btn primary big" href={next}>Answer this battle</a>
	{:else}
		<a class="btn primary big" href="/signup?next={encodeURIComponent(next)}">Sign up &amp; answer</a>
		<p class="mono small login">Already battling? <a href="/login?next={encodeURIComponent(next)}">Log in</a></p>
	{/if}

	<ol class="how mono">
		<li><span>01</span> Upload your beat (2:00 max, trimmed in your browser)</li>
		<li><span>02</span> The crowd listens to 75% of both, then scores them</li>
		<li><span>03</span> Scores stay sealed until the clock hits zero</li>
	</ol>
</article>

<style>
	.flyer { padding: 4px 0 20px; }
	.kicker { color: var(--muted); margin: 0 0 14px; font-size: 0.66rem; }
	.who { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
	.rec { color: var(--dim); text-decoration: none; }
	.rec:hover { color: var(--paper); }
	.headline { font-size: clamp(2.6rem, 12vw, 5rem); line-height: 0.9; margin: 0 0 8px; overflow-wrap: anywhere; }
	.name { color: var(--c); }
	.title { color: var(--dim); margin: 0 0 18px; font-size: 1.05rem; }
	.player { margin-bottom: 18px; }
	.player p { margin: 8px 0 0; font-weight: 400; }
	.big { display: flex; justify-content: center; width: 100%; min-height: 58px; font-size: 1.5rem; }
	.login { text-align: center; color: var(--dim); margin: 12px 0 0; }
	.mine { background: var(--ink-2); border: 1.5px dashed var(--line-2); border-radius: var(--radius); padding: 14px 16px; }
	.mine .display { font-size: 1.5rem; margin: 0 0 4px; }
	.mine p { margin: 0 0 10px; }
	.how { list-style: none; padding: 0; margin: 26px 0 0; display: grid; gap: 8px; color: var(--dim); font-weight: 400; font-size: 0.7rem; }
	.how span { color: var(--c); margin-right: 8px; font-weight: 700; }
	@media (min-width: 900px) { .flyer { max-width: 640px; } }
</style>
