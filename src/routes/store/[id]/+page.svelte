<script lang="ts">
	import { enhance } from '$app/forms';
	import Player from '#lib/components/Player.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import StoreCard from '#lib/components/StoreCard.svelte';
	import Verified from '#lib/components/Verified.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import { money } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const it = $derived(data.item);
	const b = $derived(data.battle);
	let buying = $state(false);
	let stems = $state('0');
	const facts = $derived(
		[
			['BPM', it.bpm ? String(it.bpm) : null],
			['Key', it.musicKey],
			['Genre', it.genre],
			['Mood', it.moods.length ? it.moods.join(' / ') : null],
			['File', `${it.format?.toUpperCase() ?? 'MP3'}${it.tagged ? ' (tagged)' : ''}`],
			['Stems', it.hasStems ? `+${money((it.stemsPriceCents ?? 0) - it.priceCents)}` : 'Not included']
		].filter((f): f is [string, string] => !!f[1])
	);
	const STATUS: Record<string, string> = $derived({
		after: 'Buying opens when the battle ends',
		mine: 'This is your beat',
		soon: 'Checkout opens soon',
		unavailable: `Not for sale yet — @${data.item.seller.username} is setting up payouts`,
		held: "Someone's checking out right now. If they don't finish, it's back shortly."
	});
	const ago = (t: number) => {
		const d = Math.round((Date.now() - t) / 86_400_000);
		return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
	};
</script>

<svelte:head><title>{it.title} by {it.seller.username} · AuxRiot store</title></svelte:head>

<p class="mono muted kicker"><a href="/store">The store</a> — exclusive beat</p>

<article class="beat" style:--c={it.color}>
	{#if it.status === 'sold'}<span class="stamp display">Sold</span>{/if}
	<h1 class="display title">{it.title}{#if it.rounds > 1}<span class="mono rnd"> · round {it.round}</span>{/if}</h1>
	<div class="by">
		<a class="seller" href="/u/{it.seller.username}#store">
			<Avatar username={it.seller.username} avatarKey={it.seller.avatarKey} color={it.seller.color} size={32} />
			<span class="mono">@{it.seller.username}</span>
		</a>
		{#if it.won}<span class="mono won">★ Battle winner</span>{/if}
	</div>

	<Player src={it.preview.src} peaks={it.preview.peaks} durationMs={it.preview.durationMs} name={it.title} accent={it.color} variant="compact" />

	<dl class="facts">
		{#each facts as [k, v] (k)}<div><dt class="mono">{k}</dt><dd>{v}</dd></div>{/each}
	</dl>

	<section class="buy" id="buy">
		<div class="price-row">
			<div>
				<span class="display price">{money(it.priceCents)}</span>
				<span class="mono small muted">Exclusive license · one buyer, then it's gone</span>
			</div>
		</div>
		{#if it.buy === 'sold'}
			<p class="mono small muted">Sold. It's off the market for good.</p>
		{:else if it.buy === 'buy' && data.user}
			<form method="POST" action="?/buy" class="stack buyf" use:enhance={() => { buying = true; return async ({ update }) => { await update({ reset: false }); buying = false; }; }}>
				{#if it.hasStems}
					<fieldset class="opts">
						<label><input type="radio" name="stems" value="0" bind:group={stems} /> Beat only — {money(it.priceCents)}</label>
						<label><input type="radio" name="stems" value="1" bind:group={stems} /> Beat + stems — {money(it.stemsPriceCents)}</label>
					</fieldset>
				{/if}
				<div>
					<label for="legal">Your full legal name</label>
					<input id="legal" type="text" name="legal_name" maxlength="100" required placeholder="Printed on your license" autocomplete="name" />
				</div>
				<label class="agree"><input type="checkbox" name="agree" required /><span>I agree to the <a href="/store/license" target="_blank">Exclusive Beat License</a> and the <a href="/store/terms" target="_blank">Store Terms</a>. Refunds are available until my first download.</span></label>
				{#if form?.buyError}<p class="error small">{form.buyError}</p>{/if}
				<button class="primary full" disabled={buying}>{buying ? 'Opening checkout…' : `Buy for ${money(stems === '1' ? it.stemsPriceCents : it.priceCents)}`}</button>
				<p class="mono small muted">Secure checkout by Stripe. Sales tax is added where it applies. The beat is held for you for 30 minutes.</p>
			</form>
		{:else if it.buy === 'buy'}
			<a class="btn primary full" href="/login?next=/store/{it.id}%23buy">Log in to buy</a>
		{:else}
			<p class="status mono">{STATUS[it.buy ?? ''] ?? ''}</p>
		{/if}
		{#if it.buy !== 'mine' && it.status !== 'sold'}
			<a class="mono msg" href="/messages/new?listing={it.id}">✉ Message @{it.seller.username} privately</a>
		{/if}
	</section>

	{#if b}
		<a class="battled" href="/battles/{b.id}">
			<span class="mono small muted">Battled in</span>
			<span class="display bt">{b.title}</span>
			<span class="mono small">
				{#if b.outcome === 'won'}<span class="w">Won</span>{:else if b.outcome === 'lost'}Lost{:else if b.outcome === 'tie'}Tied{:else}Live now{/if}
				{#if b.opponent} vs @{b.opponent}{/if}
				{#if b.score} · {b.score[0].toFixed(1)}–{b.score[1].toFixed(1)}{/if}
			</span>
			<span class="mono small go">Hear the battle →</span>
		</a>
	{/if}
</article>

<section class="qa" id="qa">
	<h2 class="display">Questions{data.questions.length ? ` · ${data.questions.length}` : ''}</h2>
	{#if !data.questions.length}<p class="muted small">No questions yet. Ask the producer about samples, mix, or anything else — answers are public.</p>{/if}
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
	{#if data.user && it.buy !== 'mine' && it.status !== 'sold'}
		<form method="POST" action="?/ask" class="row" use:enhance={() => async ({ update }) => update({ reset: true })}>
			<input type="text" name="body" maxlength="500" placeholder="Ask in public — answers help everyone" required value={form && 'qBody' in form ? String(form.qBody ?? '') : ''} />
			<button class="small-btn">Ask</button>
		</form>
		{#if form?.qError}<p class="error small">{form.qError}</p>{/if}
	{:else if !data.user}
		<p class="mono small muted"><a href="/login?next=/store/{it.id}%23qa">Log in</a> to ask a question.</p>
	{/if}
</section>

{#if data.more.length}
	<section class="more">
		<div class="more-head"><h2 class="display">More from @{it.seller.username}</h2><a class="mono small" href="/u/{it.seller.username}#store">All →</a></div>
		<ul class="grid">{#each data.more as m (m.id)}<li><StoreCard item={m} showSeller={false} /></li>{/each}</ul>
	</section>
{/if}

<p class="mono small muted legal"><a href="/store/terms">Store Terms</a> · <a href="/store/license">Exclusive Beat License</a></p>

<style>
	.kicker { margin: 8px 0 12px; }
	.kicker a { color: var(--muted); }
	.beat { position: relative; overflow: hidden; background: var(--ink-2); border-left: 6px solid var(--c); border-radius: var(--radius); padding: 18px; display: grid; gap: 14px; min-width: 0; }
	.stamp { position: absolute; top: 18px; right: -40px; transform: rotate(18deg); background: var(--pink); color: var(--ink); padding: 4px 50px; font-size: 1.4rem; letter-spacing: 0.08em; }
	.title { font-size: clamp(2.2rem, 10vw, 3.4rem); line-height: 0.92; margin: 0; overflow-wrap: anywhere; }
	.rnd { font-size: 0.8rem; color: var(--dim); }
	.by { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	.seller { display: inline-flex; align-items: center; gap: 8px; color: var(--paper); text-decoration: none; }
	.seller:hover { color: var(--pink); }
	.won { color: var(--warn); font-size: 0.7rem; }
	.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin: 0; }
	.facts div { border-top: 1.5px dashed var(--line-2); padding-top: 6px; min-width: 0; }
	.facts dt { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
	.facts dd { margin: 2px 0 0; color: var(--paper); overflow-wrap: anywhere; }
	.buy { background: var(--ink); border: 1.5px solid var(--line-2); border-radius: var(--radius); padding: 14px; display: grid; gap: 12px; }
	.price-row span { display: block; }
	.price { font-size: 2.6rem; line-height: 1; }
	.buyf .opts { border: 0; padding: 0; margin: 0; display: grid; gap: 6px; }
	.buyf .opts label, .buyf .agree { display: flex; gap: 8px; align-items: flex-start; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--dim); font-size: 0.92rem; }
	.buyf input[type='checkbox'], .buyf input[type='radio'] { width: 18px; height: 18px; accent-color: var(--pink); flex: none; margin-top: 2px; }
	.buyf input[name='legal_name'] { width: 100%; box-sizing: border-box; }
	.status { margin: 0; color: var(--dim); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
	.msg { color: var(--paper); text-decoration: none; font-size: 0.72rem; }
	.msg:hover { color: var(--pink); }
	.battled { display: grid; gap: 4px; text-decoration: none; color: var(--paper); border: 1.5px dashed var(--line-2); border-radius: var(--radius); padding: 12px 14px; }
	.battled:hover { border-color: var(--c); }
	.bt { font-size: 1.5rem; line-height: 1; overflow-wrap: anywhere; }
	.w { color: var(--warn); }
	.go { color: var(--c); }
	.qa { margin-top: 24px; display: grid; gap: 10px; }
	.qa h2, .more h2 { margin: 0; font-size: 1.6rem; }
	.qa ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
	.qa li { border-top: 1px solid var(--line); padding-top: 10px; }
	.qa p { margin: 0; }
	.q a { color: var(--paper); text-decoration: none; }
	.a { margin-top: 6px !important; padding-left: 10px; border-left: 3px solid var(--pink); color: var(--paper); }
	.a .mono { color: var(--pink); }
	.row { display: flex; gap: 6px; }
	.row input { flex: 1; min-width: 0; }
	.more { margin-top: 28px; display: grid; gap: 12px; }
	.more-head { display: flex; justify-content: space-between; align-items: baseline; }
	.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
	.legal { margin-top: 24px; }
</style>
