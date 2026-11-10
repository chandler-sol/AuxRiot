<script lang="ts">
	import Player from '#lib/components/Player.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let st = $derived(data.stats);

	const ROUNDS = [
		['01', 'Drop it', 'Post a beat, up to 2:00.'],
		['02', 'Get called out', 'First producer to answer takes corner B.'],
		['03', 'Crowd scores it', 'Drums, melody, mix, overall — after hearing 75% of both.'],
		['04', 'Winner gets stamped', 'Scores stay sealed until the clock hits zero.']
	];
	const TAPE = ['No bots', 'No payola', '75% listen rule', 'Sealed scores', '1v1 only', 'Crowd decides'];
</script>

<svelte:head>
	<title>AuxRiot — 1v1 beat battles. The crowd decides.</title>
	<meta
		name="description"
		content="1v1 beat battles judged by people who actually listened. Post a beat, get called out, let the crowd decide."
	/>
</svelte:head>

<section class="hero">
	<div class="hero-main">
	<p class="mono kicker">AuxRiot — 1v1 beat battles — open every night</p>
	<h1 class="headline">
		No likes.<br />
		No algorithm.<br />
		<span>Just who hit harder.</span>
	</h1>
	<p class="sub">
		Post a beat. Get called out. Let a crowd that actually listened decide who walks away with the W.
	</p>
	<div class="ctas">
		<a class="btn primary big" href="/signup">Join free</a>
		<a class="btn big" href="/battles">See live battles{st.live ? ` · ${st.live}` : ''}</a>
	</div>
	</div>
	{#if data.samples.length || st.battles > 0}
		<aside class="hero-side">
			{#if data.samples[0]}
				{@const f = data.samples[0]}
				<div class="featured">
					<p class="mono kicker">Now playing on AuxRiot</p>
					<Player
						variant="full"
						src={f.src}
						peaks={f.peaks}
						durationMs={f.durationMs}
						name={f.name}
						corner={f.status === 'voting' ? '● Live' : f.status === 'open' ? 'Open' : 'Final'}
						accent={f.color}
						previewSeconds={30}
					/>
					<a class="mono from" href="/battles/{f.battleId}">From {f.matchup} →</a>
				</div>
			{/if}
			{#if st.battles > 0}
				<div class="stats">
					<div><span class="display">{st.battles}</span><span class="mono">Battles fought</span></div>
					<div><span class="display">{st.producers}</span><span class="mono">Producers</span></div>
					<div><span class="display">{st.votes}</span><span class="mono">Votes cast</span></div>
				</div>
			{/if}
		</aside>
	{/if}
</section>

<div class="tape-wrap" aria-hidden="true">
	<div class="tape mono">
		{#each [0, 1, 2, 3, 4, 5] as rep (rep)}
			{#each TAPE as t, i (i)}<span>{t}</span><span>★</span>{/each}
		{/each}
	</div>
</div>

<section class="block">
	<div class="block-head">
		<h2>Hear the riot</h2>
		<span class="mono muted">30-second previews</span>
	</div>
	{#if data.samples.length}
		<div class="samples">
			{#each data.samples as s (s.id)}
				<div class="sample">
					<Player
						variant="full"
						src={s.src}
						peaks={s.peaks}
						durationMs={s.durationMs}
						name={s.name}
						corner={s.status === 'voting' ? '● Live' : s.status === 'open' ? 'Open' : 'Final'}
						accent={s.color}
						previewSeconds={30}
					/>
					<a class="mono from" href="/battles/{s.battleId}">From {s.matchup} →</a>
				</div>
			{/each}
		</div>
		<p class="more">
			<a class="btn primary" href="/signup">Hear full beats and vote</a>
		</p>
	{:else}
		<div class="empty">
			<p class="display">The first beats drop soon.</p>
			<p class="muted">Be one of them — the first battles set the bar.</p>
			<a class="btn primary" href="/signup">Claim your spot</a>
		</div>
	{/if}
</section>

<section class="block">
	<div class="block-head">
		<h2>How it goes down</h2>
		<a class="mono rules" href="/rules">Full rules →</a>
	</div>
	<ol class="rounds">
		{#each ROUNDS as [n, t, d] (n)}
			<li><span class="display num">{n}</span><div><h3>{t}</h3><p>{d}</p></div></li>
		{/each}
	</ol>
</section>

<section class="block">
	<h2>Why it's different</h2>
	<div class="tickets">
		<div class="ticket">
			<span class="mono k">Rule 1</span>
			<span class="display v">You listen, then you vote.</span>
			<p>No drive-by votes. You have to hear 75% of both beats before your scorecard unlocks.</p>
		</div>
		<div class="ticket">
			<span class="mono k">Rule 2</span>
			<span class="display v">Scores stay sealed.</span>
			<p>Nobody sees who's winning until the clock runs out. No pile-ons, no bandwagons.</p>
		</div>
		<div class="ticket">
			<span class="mono k">Rule 3</span>
			<span class="display v">Alts don't count.</span>
			<p>Fake accounts and vote rings get quietly discounted. Win it straight or don't win it.</p>
		</div>
	</div>
</section>

<section class="final">
	<div>
		<p class="mono kicker">Doors are open</p>
		<p class="display line">Your beat.<br />Their beat.<br /><span>One winner.</span></p>
	</div>
	<div class="ctas">
		<a class="btn primary big" href="/signup">Join free</a>
		<a class="btn big" href="/login">Log in</a>
	</div>
</section>

<style>
	.hero { padding: 24px 0 20px; }
	.kicker { color: var(--muted); margin: 0 0 14px; }
	.headline { font-size: clamp(2.8rem, 13.2vw, 6.4rem); line-height: 0.9; margin-bottom: 18px; }
	.headline span { color: var(--pink); }
	.sub { color: var(--dim); font-size: 1.1rem; max-width: 30em; margin: 0 0 22px; }
	.ctas { display: flex; gap: 10px; flex-wrap: wrap; }
	.big { min-height: 54px; padding: 4px 26px 0; font-size: 1.35rem; }

	.tape-wrap { overflow: hidden; margin: 6px calc(50% - 50vw) 14px; padding: max(12px, 2vw) 0; }
	.tape {
		display: flex; gap: 18px; white-space: nowrap; width: max-content;
		background: var(--pink); color: var(--ink); padding: 10px 20px; font-size: 0.8rem;
		transform-origin: 50vw 50%;
		transform: rotate(-2deg) translateX(-10px);
		animation: scroll 36s linear infinite;
	}
	@keyframes scroll { to { transform: rotate(-2deg) translateX(-50%); } }
	@media (prefers-reduced-motion: reduce) { .tape { animation: none; } }

	.hero-side { display: flex; flex-direction: column; gap: 14px; margin-top: 24px; }
	.featured { display: none; }
	.featured .kicker { margin-bottom: 10px; }
	.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; background: var(--paper); color: var(--ink); border-radius: var(--radius); padding: 14px 8px 12px; text-align: center; margin-bottom: 8px; }
	.stats div { display: flex; flex-direction: column; }
	.stats .display { font-size: 2.2rem; line-height: 1; }
	.stats .mono { color: #5a544b; font-size: 0.6rem; margin-top: 4px; }

	.block { margin-top: 36px; }
	.block-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 14px; }
	.block-head h2 { margin: 0; font-size: 2.2rem; }
	.block > h2 { font-size: 2.2rem; }
	.samples { display: grid; gap: 14px; }
	.sample { display: flex; flex-direction: column; gap: 6px; }
	.from { color: var(--muted); text-decoration: none; align-self: flex-end; font-weight: 400; }
	.from:hover { color: var(--paper); }
	.more { margin: 18px 0 0; }
	.empty { background: var(--ink-2); border-left: 6px solid var(--pink); padding: 20px 16px; border-radius: var(--radius); }
	.empty .display { font-size: 2rem; margin: 0 0 6px; }
	.empty p { margin: 0 0 14px; }

	.rules { color: var(--paper); text-decoration: none; border-bottom: 1.5px solid var(--pink); }
	.rules:hover { color: var(--pink); }
	.rounds { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
	.rounds li { display: flex; gap: 16px; align-items: flex-start; background: var(--ink-2); padding: 14px 16px; }
	.num { font-size: 2.3rem; line-height: 0.9; color: var(--pink); min-width: 48px; }
	.rounds h3 { margin: 2px 0 2px; font-size: 1.4rem; }
	.rounds p { margin: 0; color: var(--dim); }

	.tickets { display: grid; gap: 12px; }
	@media (min-width: 640px) { .tickets { grid-template-columns: repeat(3, 1fr); } }
	.ticket {
		position: relative; background: var(--paper); color: var(--ink); border-radius: var(--radius); padding: 16px 16px 14px;
		display: flex; flex-direction: column; gap: 6px;
	}
	.ticket .k { color: var(--pink); }
	.ticket .v { font-size: 1.7rem; line-height: 0.95; }
	.ticket p { margin: 8px 0 0; padding-top: 10px; border-top: 1.5px dashed rgba(14, 13, 11, 0.25); color: #3d3831; font-size: 0.95rem; }

	.final { margin-top: 48px; padding: 28px 0 8px; border-top: 1.5px dashed var(--line-2); }
	.line { font-size: clamp(3rem, 15vw, 5.6rem); line-height: 0.9; margin: 0 0 22px; }
	.line span { color: var(--pink); }

	@media (min-width: 960px) {
		.hero { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 56px; align-items: center; padding-top: 48px; }
		.headline { font-size: clamp(3.6rem, 5.4vw, 6.4rem); }
		.sub { font-size: 1.2rem; }
		.hero-side { margin-top: 0; }
		.featured { display: flex; flex-direction: column; gap: 6px; }
		.samples { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		/* The first beat is already featured in the hero on desktop. */
		.samples .sample:first-child { display: none; }
		.block { margin-top: 56px; }
		.block-head h2, .block > h2 { font-size: 3rem; }
		.rounds { grid-template-columns: repeat(4, minmax(0, 1fr)); }
		.rounds li { flex-direction: column; gap: 10px; padding: 22px 20px; border-radius: 0; }
		.rounds li:first-child { border-radius: var(--radius) 0 0 var(--radius); }
		.rounds li:last-child { border-radius: 0 var(--radius) var(--radius) 0; }
		.num { font-size: 3.2rem; }
		.final { display: flex; justify-content: space-between; align-items: flex-end; gap: 32px; margin-top: 72px; }
		.line { font-size: clamp(4rem, 7vw, 7rem); margin: 0; }
	}
</style>
