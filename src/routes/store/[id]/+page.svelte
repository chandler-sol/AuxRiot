<script lang="ts">
	import { enhance } from '$app/forms';
	import Player from '#lib/components/Player.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Verified from '#lib/components/Verified.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import { money } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const it = $derived(data.item);
	const b = $derived(data.battle);
	let stems = $state(false);
	const details = $derived(
		[it.bpm ? `${it.bpm} BPM` : null, it.musicKey, it.genre, it.moods.length ? it.moods.join(' / ') : null, `${it.format?.toUpperCase() ?? 'MP3'}${it.tagged ? ' · tagged' : ''}`].filter(Boolean).join(' · ')
	);
	const STATUS: Record<string, string> = $derived({
		after: 'Buying opens when the battle ends.',
		mine: 'This is your beat.',
		soon: 'Checkout opens soon.',
		unavailable: `Not for sale yet: @${data.item.seller.username} is still setting up payouts.`,
		held: "Someone's checking out right now. If they don't finish, it's back shortly."
	});
	const ago = (t: number) => {
		const d = Math.round((Date.now() - t) / 86_400_000);
		return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
	};
</script>

<svelte:head><title>{it.title} by {it.seller.username} · AuxRiot store</title></svelte:head>

<p class="mono muted kicker"><a href="/store">← The store</a></p>

<article class="beat" style:--c={it.color}>
	{#if it.status === 'sold'}<span class="stamp display">Sold</span>{/if}

	<header class="head">
		<h1 class="display title">{it.title}{#if it.rounds > 1}<span class="mono rnd"> · round {it.round}</span>{/if}</h1>
		<div class="by">
			<a class="seller" href="/u/{it.seller.username}">
				<Avatar username={it.seller.username} avatarKey={it.seller.avatarKey} color={it.seller.color} size={28} />
				<span class="mono">@{it.seller.username}</span>
			</a>
			{#if it.won}<span class="mono won">★ Battle winner</span>{/if}
			{#if it.buy !== 'mine' && it.status !== 'sold'}<a class="mono msg" href="/messages/new?listing={it.id}">✉ Message</a>{/if}
		</div>
	</header>

	<Player src={it.preview.src} peaks={it.preview.peaks} durationMs={it.preview.durationMs} name={it.title} accent={it.color} variant="compact" />
	{#if details}<p class="mono details">{details}</p>{/if}

	<section class="buy" id="buy">
		{#if it.hasStems && it.status !== 'sold'}
			<div class="choice" role="radiogroup" aria-label="What you're buying">
				<button type="button" role="radio" aria-checked={!stems} class:on={!stems} onclick={() => (stems = false)}><span>Beat</span><span class="display">{money(it.priceCents)}</span></button>
				<button type="button" role="radio" aria-checked={stems} class:on={stems} onclick={() => (stems = true)}><span>Beat + stems</span><span class="display">{money(it.stemsPriceCents)}</span></button>
			</div>
		{:else}
			<p class="display price">{money(it.priceCents)}</p>
		{/if}
		<p class="mono small muted sub">Exclusive license · one buyer, then it's gone</p>
		{#if it.buy === 'sold'}
			<p class="status mono">Sold — off the market for good.</p>
		{:else if it.buy === 'buy'}
			<a class="btn primary full buybtn" href={data.user ? `/store/${it.id}/checkout${stems ? '?stems=1' : ''}` : `/login?next=/store/${it.id}`}>
				{data.user ? `Buy · ${money(stems ? it.stemsPriceCents : it.priceCents)}` : 'Log in to buy'}
			</a>
		{:else}
			<p class="status mono">{STATUS[it.buy ?? ''] ?? ''}</p>
		{/if}
	</section>

	{#if b}
		<a class="battled" href="/battles/{b.id}">
			<span class="mono small muted">Battled in</span>
			<span class="bt"><span class="display">{b.title}</span></span>
			<span class="mono small res">
				{#if b.outcome === 'won'}<span class="w">Won</span>{:else if b.outcome === 'lost'}Lost{:else if b.outcome === 'tie'}Tied{:else}Live now{/if}{#if b.opponent}{` vs @${b.opponent}`}{/if}{#if b.score}{` · ${b.score[0].toFixed(1)}–${b.score[1].toFixed(1)}`}{/if}
				<span class="go">Hear it →</span>
			</span>
		</a>
	{/if}
</article>

<section class="qa" id="qa">
	<h2 class="display">Questions{data.questions.length ? ` · ${data.questions.length}` : ''}</h2>
	{#if data.questions.length}
		<ul>
			{#each data.questions as q (q.id)}
				<li>
					<p class="q"><a class="mono" href="/u/{q.username}">@{q.username}</a> <Verified label={q.verified_label} compact /> <Flair respect={q.respect} /> {q.body}</p>
					{#if q.held}<p class="mono small muted">Waiting for review — only you and the producer can see this.</p>{/if}
					{#if q.answer}
						<p class="a"><span class="mono">@{it.seller.username}:</span> {q.answer}</p>
					{:else if it.buy === 'mine'}
						<form method="POST" action="?/answer" class="row" use:enhance={() => async ({ update }) => update({ reset: true })}>
							<input type="hidden" name="question_id" value={q.id} />
							<input type="text" name="answer" maxlength="1000" placeholder="Answer publicly…" required />
							<button class="small-btn">Answer</button>
						</form>
						{#if form?.aError && form.aId === q.id}<p class="error small">{form.aError}</p>{/if}
					{:else}
						<p class="mono small muted">Not answered yet · asked {ago(q.created_at)}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if data.user && it.buy !== 'mine' && it.status !== 'sold'}
		<form method="POST" action="?/ask" class="row" use:enhance={() => async ({ update }) => update({ reset: true })}>
			<input type="text" name="body" maxlength="500" placeholder="Ask about samples, the mix… (public)" required value={form && 'qBody' in form ? String(form.qBody ?? '') : ''} />
			<button class="small-btn">Ask</button>
		</form>
		{#if form?.qError}<p class="error small">{form.qError}</p>{/if}
	{:else if !data.user}
		<p class="mono small muted"><a href="/login?next=/store/{it.id}%23qa">Log in</a> to ask a question.</p>
	{:else if !data.questions.length}
		<p class="muted small">No questions yet.</p>
	{/if}
</section>

{#if data.more.length}
	<section class="more">
		<div class="more-head"><h2 class="display">More from @{it.seller.username}</h2><a class="mono small" href="/u/{it.seller.username}#store">All →</a></div>
		<ul>
			{#each data.more as m (m.id)}
				<li>
					<a class="mrow" href="/store/{m.id}" style:--c={m.color}>
						<span class="mt"><span class="display">{m.title}</span>{#if m.rounds > 1}<span class="mono small muted"> · round {m.round}</span>{/if}</span>
						<span class="mono small muted mm">{[m.bpm ? `${m.bpm} BPM` : '', m.musicKey ?? '', m.genre ?? ''].filter(Boolean).join(' · ')}</span>
						<span class="display mp">{money(m.priceCents)}</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<p class="mono small muted legal"><a href="/store/terms">Store Terms</a> · <a href="/store/license">Exclusive Beat License</a></p>

<style>
	.kicker { margin: 8px 0 12px; }
	.kicker a { color: var(--muted); text-decoration: none; }
	.beat { position: relative; overflow: hidden; background: var(--ink-2); border-left: 6px solid var(--c); border-radius: var(--radius); padding: 20px 18px; display: grid; gap: 16px; min-width: 0; }
	.beat p { margin: 0; }
	.stamp { position: absolute; top: 18px; right: -40px; transform: rotate(18deg); background: var(--pink); color: var(--ink); padding: 4px 50px; font-size: 1.4rem; letter-spacing: 0.08em; }
	.head { display: grid; gap: 10px; }
	.title { font-size: clamp(2.2rem, 10vw, 3.2rem); line-height: 0.92; margin: 0; overflow-wrap: anywhere; }
	.rnd { font-size: 0.8rem; color: var(--dim); }
	.by { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; }
	.seller { display: inline-flex; align-items: center; gap: 8px; color: var(--paper); text-decoration: none; }
	.seller:hover { color: var(--pink); }
	.won { color: var(--warn); font-size: 0.66rem; }
	.msg { margin-left: auto; color: var(--paper); text-decoration: none; font-size: 0.7rem; }
	.msg:hover { color: var(--pink); }
	.details { color: var(--dim); font-size: 0.72rem; line-height: 1.6; }
	.buy { display: grid; gap: 10px; border-top: 1.5px dashed var(--line-2); padding-top: 16px; }
	.price { font-size: 2.6rem; line-height: 1; }
	.sub { margin-top: -2px !important; }
	.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.choice button { display: grid; gap: 4px; justify-items: start; min-height: 0; padding: 10px 12px; text-align: left; text-transform: none; letter-spacing: 0; font-family: var(--body); font-size: 0.85rem; font-weight: 600; color: var(--dim); background: transparent; border: 1.5px solid var(--line-2); border-radius: var(--radius); }
	.choice button .display { font-size: 1.9rem; line-height: 1; color: var(--dim); }
	.choice button.on { border-color: var(--paper); background: var(--ink); color: var(--paper); }
	.choice button.on .display { color: var(--paper); }
	.buybtn { min-height: 48px; font-size: 1.2rem; }
	.status { color: var(--dim); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; line-height: 1.6; }
	.battled { display: grid; gap: 4px; text-decoration: none; color: var(--paper); border-top: 1.5px dashed var(--line-2); padding-top: 14px; }
	.bt .display { font-size: 1.3rem; line-height: 1; overflow-wrap: anywhere; }
	.res { display: flex; gap: 8px; flex-wrap: wrap; color: var(--paper); }
	.w { color: var(--warn); }
	.go { margin-left: auto; color: var(--c); }
	.battled:hover .go { text-decoration: underline; }
	.qa, .more { margin-top: 28px; display: grid; gap: 12px; }
	.qa h2, .more h2 { margin: 0; font-size: 1.5rem; }
	.qa ul, .more ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
	.qa li { border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 6px; }
	.qa p { margin: 0; }
	.q a { color: var(--paper); text-decoration: none; }
	.a { padding-left: 10px; border-left: 3px solid var(--pink); color: var(--paper); }
	.a .mono { color: var(--pink); }
	.row { display: flex; gap: 6px; }
	.row input { flex: 1; min-width: 0; }
	.more-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
	.more ul { gap: 8px; }
	.mrow { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 't p' 'm p'; gap: 2px 12px; align-items: center; padding: 10px 12px; background: var(--ink-2); border-left: 4px solid var(--c); border-radius: var(--radius); text-decoration: none; color: var(--paper); }
	.mrow:hover { background: var(--ink-3); }
	.mt { grid-area: t; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.mt .display { font-size: 1.15rem; }
	.mm { grid-area: m; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.mp { grid-area: p; font-size: 1.5rem; }
	.legal { margin-top: 28px; }
</style>
