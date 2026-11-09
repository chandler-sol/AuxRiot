<script lang="ts">
	import { enhance } from '$app/forms';
	import Player from '#lib/components/Player.svelte';
	import Stars from '#lib/components/Stars.svelte';
	import Uploader from '#lib/components/Uploader.svelte';
	import CopyrightNotice from '#lib/components/CopyrightNotice.svelte';
	import ReportForm from '#lib/components/ReportForm.svelte';
	import type { PreparedAudio } from '#lib/audio-prep.ts';
	import { ago, timeLeft } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const CATS = [
		['drums', 'Drums'],
		['melody', 'Melody'],
		['mix', 'Mix'],
		['overall', 'Overall']
	] as const;
	const COLORS = ['var(--accent)', 'var(--accent-2)'];

	let b = $derived(data.battle);
	let names = $derived([b.creator, b.challenger ?? '???']);

	// Live listen progress per entry (players update these as you listen).
	let listened = $state<Record<string, number>>({});
	let scores = $state([blank(), blank()]);
	let seenBattle = '';
	$effect.pre(() => {
		if (seenBattle !== data.battle.id) {
			seenBattle = data.battle.id;
			listened = {};
			scores = data.myVote ? structuredClone(data.myVote) : [blank(), blank()];
		}
		// New entries (e.g. a challenger just answered) need a starting value for bind:listenedMs.
		for (const e of data.entries) if (!(e.id in listened)) listened[e.id] = e.listenedMs;
	});
	function blank() {
		return { drums: 0, melody: 0, mix: 0, overall: 0 };
	}

	let allHeard = $derived(
		data.entries.length === 2 && data.entries.every((e) => (listened[e.id] ?? 0) >= e.durationMs * data.threshold)
	);
	let allRated = $derived(scores.every((s) => s.drums && s.melody && s.mix && s.overall));

	let now = $state(Date.now());
	$effect(() => {
		now = Date.now();
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	let prepared = $state<PreparedAudio | null>(null);
	let responding = $state(false);
	let voting = $state(false);
	let commentBody = $state('');
</script>

<svelte:head><title>{b.title} · AuxRiot</title></svelte:head>

<article class="stack">
	<header class="stack">
		<div class="row spread">
			<span class="pill {b.status}">{b.status === 'voting' ? 'live vote' : b.status === 'closed' ? 'final' : b.status}</span>
			<span class="muted small">
				{#if b.status === 'voting' && b.votingEndsAt}{timeLeft(b.votingEndsAt - now)}{:else}posted {ago(b.createdAt, now)}{/if}
			</span>
		</div>
		<h1>{b.title}</h1>
		<div class="vs-big">
			<a href="/u/{b.creator}" style:color={COLORS[0]}>{b.creator}</a>
			<span class="muted">vs</span>
			{#if b.challenger}<a href="/u/{b.challenger}" style:color={COLORS[1]}>{b.challenger}</a>{:else}<span class="muted">waiting…</span>{/if}
		</div>
		{#if b.status === 'voting'}
			<p class="muted small">
				<strong class="count">{data.voteCount}</strong> vote{data.voteCount === 1 ? '' : 's'} so far · scores stay hidden until voting ends
			</p>
		{/if}
	</header>

	{#if b.status === 'closed' && b.result}
		{@const r = b.result}
		<section class="card stack results">
			<h2>
				{#if b.winnerId}👑 {b.winnerId === b.creatorId ? b.creator : b.challenger} wins{:else}It's a tie{/if}
			</h2>
			<p class="muted small">{r.countedVotes} counted vote{r.countedVotes === 1 ? '' : 's'}</p>
			<table>
				<thead><tr><th></th><th style:color={COLORS[0]}>{names[0]}</th><th style:color={COLORS[1]}>{names[1]}</th></tr></thead>
				<tbody>
					{#each CATS as [key, label] (key)}
						<tr>
							<td>{label}</td>
							{#each [0, 1] as s (s)}
								<td>
									<div class="bar-wrap"><div class="fill" style:width="{(r.slots[s].avg[key] / 5) * 100}%" style:background={COLORS[s]}></div></div>
									<span class="small">{r.slots[s].avg[key].toFixed(2)}</span>
								</td>
							{/each}
						</tr>
					{/each}
					<tr class="total"><td>Score</td><td>{r.slots[0].total.toFixed(2)}</td><td>{r.slots[1].total.toFixed(2)}</td></tr>
				</tbody>
			</table>
		</section>
	{/if}

	<section class="entries">
		{#each [0, 1] as slot (slot)}
			{@const e = data.entries.find((x) => x.slot === slot)}
			<div class="card entry" style:--c={COLORS[slot]}>
				<div class="row spread entry-head">
					<strong>{slot === 0 ? b.creator : (b.challenger ?? 'Open slot')}</strong>
					{#if b.status === 'closed' && b.winnerId && e && b.winnerId === e.userId}<span>👑</span>{/if}
				</div>
				{#if e && e.src}
					<Player
						src={e.src}
						peaks={e.peaks}
						durationMs={e.durationMs}
						label={names[slot]}
						accent={COLORS[slot]}
						entryId={data.user && b.status === 'voting' && !data.voteBlock ? e.id : undefined}
						bind:listenedMs={listened[e.id]}
						threshold={data.threshold}
					/>
				{:else if e}
					<p class="muted">This beat was removed following a copyright takedown.</p>
				{:else if data.canRespond}
					<form
						method="POST"
						action="?/respond"
						enctype="multipart/form-data"
						class="stack"
						use:enhance={({ formData, cancel }) => {
							if (!prepared) return cancel();
							formData.set('audio', prepared.blob, 'beat.mp3');
							formData.set('peaks', JSON.stringify(prepared.peaks));
							responding = true;
							return async ({ update }) => {
								await update({ reset: false });
								responding = false;
								prepared = null;
							};
						}}
					>
						<p class="muted small">Think you can beat it? First answer locks in the battle and starts a {b.voteHours}h vote.</p>
						<Uploader bind:prepared />
						<CopyrightNotice />
						{#if form?.respondError}<p class="error">{form.respondError}</p>{/if}
						<button class="primary" disabled={!prepared || responding}>{responding ? 'Uploading…' : 'Answer this battle'}</button>
					</form>
				{:else if b.status === 'open' && !data.user}
					<p class="muted"><a href="/login?next=/battles/{b.id}">Log in</a> to answer this battle.</p>
				{:else if b.status === 'open'}
					<p class="muted">Waiting for a challenger. Share the link!</p>
				{:else}
					<p class="muted">No challenger answered in time.</p>
				{/if}
			</div>
		{/each}
	</section>

	{#if b.status === 'voting'}
		<section class="card stack">
			<h2>{data.myVote ? 'Your vote' : 'Vote'}</h2>
			{#if data.voteBlock === 'login'}
				<p class="muted"><a href="/login?next=/battles/{b.id}">Log in</a> to vote.</p>
			{:else if data.voteBlock === 'participant'}
				<p class="muted">You're in this battle, so you can't vote. Share it and let the crowd decide.</p>
			{:else if data.voteBlock === 'age'}
				<p class="muted">
					New accounts can vote after a waiting period, to keep battles fair. Your vote unlocks
					{data.voterUnlockAt ? timeLeft(data.voterUnlockAt - now).replace(' left', '') : 'soon'} from now.
				</p>
			{:else}
				<form
					method="POST"
					action="?/vote"
					class="stack"
					use:enhance={() => {
						voting = true;
						return async ({ update }) => {
							await update({ reset: false });
							voting = false;
						};
					}}
				>
					<div class="ballots">
						{#each [0, 1] as s (s)}
							<div class="ballot" style:--c={COLORS[s]}>
								<h3 style:color={COLORS[s]}>{names[s]}</h3>
								{#each CATS as [key, label] (key)}
									<Stars name="s{s}_{key}" {label} bind:value={scores[s][key]} />
								{/each}
							</div>
						{/each}
					</div>
					{#if !allHeard}
						<p class="warn small">Play at least {Math.round(data.threshold * 100)}% of both beats to unlock voting.</p>
					{/if}
					{#if form?.voteError}<p class="error">{form.voteError}</p>{/if}
					{#if form?.voted}<p class="success">Vote saved. You can change it until voting ends.</p>{/if}
					<button class="primary" disabled={!allHeard || !allRated || voting}>
						{voting ? 'Saving…' : data.myVote ? 'Update vote' : 'Submit vote'}
					</button>
				</form>
			{/if}
		</section>
	{/if}

	<section class="stack">
		<h2>Comments <span class="muted small">({data.comments.length})</span></h2>
		{#if data.user}
			<form
				method="POST"
				action="?/comment"
				class="stack"
				use:enhance={() =>
					async ({ result, update }) => {
						if (result.type === 'success') commentBody = '';
						await update({ reset: false });
					}}
			>
				<textarea name="body" maxlength="1000" placeholder="Say something about these beats…" bind:value={commentBody} required></textarea>
				{#if form?.commentError}<p class="error small">{form.commentError}</p>{/if}
				<div><button disabled={!commentBody.trim()}>Post comment</button></div>
			</form>
		{:else}
			<p class="muted small"><a href="/login?next=/battles/{b.id}">Log in</a> to comment.</p>
		{/if}

		<ul class="comments">
			{#each data.comments as c (c.id)}
				<li class="card">
					<div class="row spread small">
						<a href="/u/{c.username}"><strong>{c.username}</strong></a>
						<span class="muted">{ago(c.created_at, now)}</span>
					</div>
					<p class="body">{c.body}</p>
					{#if data.user}
						<div class="row small">
							{#if data.user.id === c.user_id || data.user.isAdmin}
								<form method="POST" action="?/deleteComment" use:enhance>
									<input type="hidden" name="id" value={c.id} />
									<button class="link-btn small">Delete</button>
								</form>
							{/if}
							{#if data.user.id !== c.user_id}<ReportForm targetType="comment" targetId={c.id} />{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	{#if data.user}
		<ReportForm targetType="battle" targetId={b.id} label="Report this battle (fake votes, stolen beat…)" />
	{/if}
</article>

<style>
	.vs-big { display: flex; gap: 10px; align-items: baseline; font-size: 1.15rem; font-weight: 700; flex-wrap: wrap; }
	.count { color: var(--text); }
	.entries { display: grid; gap: 12px; }
	@media (min-width: 700px) { .entries { grid-template-columns: 1fr 1fr; } }
	.entry { border-top: 3px solid var(--c); }
	.entry-head { margin-bottom: 10px; }
	.ballots { display: grid; gap: 20px; }
	@media (min-width: 560px) { .ballots { grid-template-columns: 1fr 1fr; } }
	.ballot { display: grid; gap: 6px; }
	.ballot h3 { margin-bottom: 4px; }
	.warn { color: var(--warn); }
	.results table { width: 100%; border-collapse: collapse; }
	.results th, .results td { text-align: left; padding: 6px 4px; vertical-align: middle; }
	.results th:first-child, .results td:first-child { width: 28%; color: var(--muted); }
	.bar-wrap { height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; margin-bottom: 2px; }
	.fill { height: 100%; border-radius: 4px; }
	.total td { font-weight: 800; font-size: 1.1rem; border-top: 1px solid var(--border); padding-top: 10px; }
	.comments { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
	.comments .body { margin: 6px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
