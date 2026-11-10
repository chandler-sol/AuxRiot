<script lang="ts">
	import { enhance } from '$app/forms';
	import Player from '#lib/components/Player.svelte';
	import Scorecard from '#lib/components/Scorecard.svelte';
	import Uploader from '#lib/components/Uploader.svelte';
	import CopyrightNotice from '#lib/components/CopyrightNotice.svelte';
	import ReportForm from '#lib/components/ReportForm.svelte';
	import type { PreparedAudio } from '#lib/audio-prep.ts';
	import { pairStyle } from '#lib/colors.ts';
	import { ago, timeLeft } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const CATS = [
		['drums', 'Drums'],
		['melody', 'Melody'],
		['mix', 'Mix'],
		['overall', 'Overall']
	] as const;
	const COLORS = ['var(--a)', 'var(--b)'];

	let b = $derived(data.battle);
	let names = $derived([b.creator, b.challenger ?? '???'] as [string, string]);
	let tag = $derived('#' + b.id.slice(0, 4).toUpperCase());

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

	let stillToHear = $derived(
		data.entries
			.filter((e) => (listened[e.id] ?? 0) < e.durationMs * data.threshold)
			.map((e) => names[e.slot])
	);
	let allHeard = $derived(data.entries.length === 2 && stillToHear.length === 0);
	let allRated = $derived(scores.every((s) => s.drums && s.melody && s.mix && s.overall));

	let now = $state(Date.now());
	$effect(() => {
		now = Date.now();
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
	function hms(ms: number) {
		if (ms <= 0) return '00:00:00';
		const s = Math.floor(ms / 1000);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
	}

	/** Largest size (rem cap) at which a single-line name still fits the column; Anton glyphs ≈ 0.5em wide. */
	function fitSize(name: string, maxRem: number) {
		return `min(${maxRem}rem, calc((min(100vw, 760px) - 34px) / ${(Math.max(4, name.length) * 0.5).toFixed(2)}))`;
	}

	let winnerSlot = $derived(b.winnerId === null ? null : b.winnerId === b.creatorId ? 0 : 1);

	let prepared = $state<PreparedAudio | null>(null);
	let responding = $state(false);
	let voting = $state(false);
	let commentBody = $state('');
</script>

<svelte:head><title>{b.creator} vs {b.challenger ?? '???'} · AuxRiot</title></svelte:head>

<article style={pairStyle(b.id)}>
	{#if b.status === 'closed' && b.result}
		{@const r = b.result}
		<!-- RESULTS -->
		<section class="winner">
			<p class="mono kicker">Battle {tag} — Final — {r.countedVotes} counted vote{r.countedVotes === 1 ? '' : 's'}</p>
			{#if winnerSlot !== null}
				<h1 class="wname" style:color={COLORS[winnerSlot]} style:font-size={fitSize(names[winnerSlot], 7.5)}>{names[winnerSlot]}</h1>
				<div class="final">
					<span class="display big" style:color={COLORS[winnerSlot]}>{r.slots[winnerSlot].total.toFixed(1)}</span>
					<span class="display dash">—</span>
					<span class="display big lose" style:color={COLORS[1 - winnerSlot]}>{r.slots[1 - winnerSlot].total.toFixed(1)}</span>
					<div class="stamp" aria-hidden="true"><span class="display">Winner</span><span class="mono">By crowd vote</span></div>
				</div>
				<p class="mono muted over">Over {names[1 - winnerSlot]}</p>
			{:else}
				<h1 class="wname">Dead even</h1>
				<div class="final">
					<span class="display big" style:color={COLORS[0]}>{r.slots[0].total.toFixed(1)}</span>
					<span class="display dash">—</span>
					<span class="display big" style:color={COLORS[1]}>{r.slots[1].total.toFixed(1)}</span>
				</div>
			{/if}
			<p class="title">{b.title}</p>
		</section>

		<section class="board">
			<div class="board-head">
				<h2>The card</h2>
				<span class="keys mono">
					<i style:background={COLORS[0]}></i>{names[0]}
					<i style:background={COLORS[1]}></i>{names[1]}
				</span>
			</div>
			{#each CATS as [key, label] (key)}
				<div class="brow">
					<span class="display cat">{label}</span>
					<div class="bars">
						{#each [0, 1] as s (s)}
							{@const lose = winnerSlot !== null && s !== winnerSlot}
							<div class="bar">
								<span class="fill" class:lose style:width="{(r.slots[s].avg[key] / 5) * 100}%" style:background={COLORS[s]}></span>
								<span class="mono val" class:lose>{r.slots[s].avg[key].toFixed(1)}</span>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</section>

		<section class="replay">
			<h2>Run it back</h2>
			{#each [winnerSlot ?? 0, 1 - (winnerSlot ?? 0)] as slot (slot)}
				{@const e = data.entries.find((x) => x.slot === slot)}
				{#if e?.src}
					<Player
						variant="compact"
						src={e.src}
						peaks={e.peaks}
						durationMs={e.durationMs}
						name={names[slot]}
						accent={COLORS[slot]}
						tag={slot === winnerSlot ? 'Winner' : ''}
					/>
				{:else if e}
					<p class="muted small">{names[slot]}'s beat was removed after a copyright takedown.</p>
				{/if}
			{/each}
		</section>
	{:else}
		<!-- LIVE / OPEN / EXPIRED -->
		<section class="poster">
			<p class="mono kicker">Battle {tag} — {b.title}</p>
			<a class="pname display" href="/u/{b.creator}" style:color={COLORS[0]} style:font-size={fitSize(b.creator, 6)}>{b.creator}</a>
			<span class="vs display">— vs —</span>
			{#if b.challenger}
				<a class="pname display" href="/u/{b.challenger}" style:color={COLORS[1]} style:font-size={fitSize(b.challenger, 6)}>{b.challenger}</a>
			{:else}
				<span class="pname display tbd">???</span>
			{/if}
		</section>

		{#if b.status === 'voting' && b.votingEndsAt}
			<div class="ticket">
				<div>
					<span class="mono tl">Voting closes in</span>
					<span class="display tv">{hms(b.votingEndsAt - now)}</span>
				</div>
				<div class="tr">
					<span class="display tv">{data.voteCount}</span>
					<span class="mono tl">Vote{data.voteCount === 1 ? '' : 's'} in · sealed</span>
				</div>
			</div>
		{:else if b.status === 'open'}
			<div class="ticket">
				<div>
					<span class="mono tl">Status</span>
					<span class="display tv sm">Needs a challenger</span>
				</div>
				<div class="tr">
					<span class="display tv">{b.voteHours}h</span>
					<span class="mono tl">Vote once answered</span>
				</div>
			</div>
		{:else}
			<p class="mono muted">Expired — nobody answered in time · posted {ago(b.createdAt, now)}</p>
		{/if}

		<section class="players">
			{#each [0, 1] as slot (slot)}
				{@const e = data.entries.find((x) => x.slot === slot)}
				{#if e && e.src}
					<Player
						variant="full"
						src={e.src}
						peaks={e.peaks}
						durationMs={e.durationMs}
						name={names[slot]}
						corner={slot === 0 ? 'Corner A' : 'Corner B'}
						accent={COLORS[slot]}
						entryId={data.user && b.status === 'voting' && !data.voteBlock ? e.id : undefined}
						bind:listenedMs={listened[e.id]}
						threshold={data.threshold}
					/>
				{:else if e}
					<div class="slot" style:--c={COLORS[slot]}><p class="muted">This beat was removed following a copyright takedown.</p></div>
				{:else if data.canRespond}
					<form
						method="POST"
						action="?/respond"
						enctype="multipart/form-data"
						class="slot stack"
						style:--c={COLORS[1]}
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
						<h2 class="answer">Think you can take it?</h2>
						<p class="muted small">First answer locks in the battle and starts a {b.voteHours}h vote.</p>
						<Uploader bind:prepared />
						<CopyrightNotice />
						{#if form?.respondError}<p class="error">{form.respondError}</p>{/if}
						<button class="primary full" disabled={!prepared || responding}>{responding ? 'Uploading…' : 'Answer this battle'}</button>
					</form>
				{:else if b.status === 'open' && !data.user}
					<div class="slot" style:--c={COLORS[1]}>
						<p class="display open-cta">Corner B is open.</p>
						<p class="muted"><a href="/login?next=/battles/{b.id}">Log in</a> to answer this battle.</p>
					</div>
				{:else if b.status === 'open'}
					<div class="slot" style:--c={COLORS[1]}>
						<p class="display open-cta">Waiting for a challenger.</p>
						<p class="muted small">Share the link — first producer to answer takes the slot.</p>
					</div>
				{/if}
			{/each}
		</section>

		{#if b.status === 'voting'}
			<section class="scorecard">
				<div class="sc-head">
					<h2>{data.myVote ? 'Your scorecard' : 'Score it'}</h2>
					<span class="mono muted">Tap 1–5</span>
				</div>
				{#if data.voteBlock === 'login'}
					<p class="muted"><a href="/login?next=/battles/{b.id}">Log in</a> to vote.</p>
				{:else if data.voteBlock === 'participant'}
					<p class="muted">You're in this battle, so you can't vote. Share it and let the crowd decide.</p>
				{:else if data.voteBlock === 'age'}
					<p class="muted">
						New accounts can vote after a short waiting period, to keep battles fair. Yours unlocks in
						{data.voterUnlockAt ? timeLeft(data.voterUnlockAt - now).replace(' left', '') : 'a moment'}.
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
						<Scorecard {names} bind:scores />
						{#if !allHeard}
							<p class="mono muted gate">
								Finish {stillToHear.join(' & ')}'s beat{stillToHear.length > 1 ? 's' : ''} to lock in your vote.
							</p>
						{:else if !allRated}
							<p class="mono muted gate">Rate every category for both beats.</p>
						{/if}
						{#if form?.voteError}<p class="error">{form.voteError}</p>{/if}
						{#if form?.voted}<p class="success">Vote locked in. You can change it until the timer runs out.</p>{/if}
						<button class="primary full" disabled={!allHeard || !allRated || voting}>
							{voting ? 'Saving…' : data.myVote ? 'Update my vote' : 'Lock in my vote'}
						</button>
					</form>
				{/if}
			</section>
		{/if}
	{/if}

	<section class="comments-sec">
		<h2>Crowd noise · {data.comments.length}</h2>
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
				{#if commentBody.trim()}<div><button>Post comment</button></div>{/if}
			</form>
		{:else}
			<p class="muted small"><a href="/login?next=/battles/{b.id}">Log in</a> to comment.</p>
		{/if}

		<ul class="comments">
			{#each data.comments as c (c.id)}
				<li>
					<div class="cmeta">
						<a class="mono" href="/u/{c.username}">@{c.username}</a>
						<span class="mono muted actions">
							{ago(c.created_at, now)}
							{#if data.user && (data.user.id === c.user_id || data.user.isAdmin)}
								<form method="POST" action="?/deleteComment" use:enhance>
									<input type="hidden" name="id" value={c.id} />
									<button class="link-btn">Delete</button>
								</form>
							{/if}
						</span>
					</div>
					<p class="body">{c.body}</p>
					{#if data.user && data.user.id !== c.user_id}<ReportForm targetType="comment" targetId={c.id} />{/if}
				</li>
			{/each}
		</ul>
	</section>

	{#if data.user}
		<div class="report-battle"><ReportForm targetType="battle" targetId={b.id} label="Report this battle (fake votes, stolen beat…)" /></div>
	{/if}
</article>

<style>
	article > section, article > .ticket { margin-bottom: 24px; }
	.kicker { color: var(--muted); margin: 0 0 10px; overflow-wrap: anywhere; }

	/* Poster header */
	.poster { display: flex; flex-direction: column; padding-top: 8px; }
	.pname { line-height: 0.9; text-decoration: none; overflow-wrap: anywhere; }
	.tbd { color: var(--muted); }
	.vs { color: var(--muted); font-size: 1.35rem; letter-spacing: 0.15em; margin: 6px 0; }

	/* Countdown ticket */
	.ticket {
		display: flex; justify-content: space-between; align-items: center; gap: 12px;
		background: var(--paper); color: var(--ink); border-radius: var(--radius);
		padding: 14px 16px 12px;
	}
	.ticket > div { display: flex; flex-direction: column; gap: 2px; }
	.tr { align-items: flex-end; text-align: right; }
	.tl { color: #5a544b; }
	.tv { font-size: 2.6rem; line-height: 1; letter-spacing: 0.02em; }
	.tv.sm { font-size: 1.6rem; }

	.players { display: grid; gap: 12px; }
	.slot { background: var(--ink-2); border-left: 6px solid var(--c); border-radius: var(--radius); padding: 16px; }
	.open-cta { font-size: 1.8rem; color: var(--c); margin: 0 0 6px; }
	.answer { color: var(--c); }
	.full { width: 100%; }

	/* Scorecard */
	.scorecard { background: var(--ink-2); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 16px; }
	.sc-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
	.sc-head h2 { margin: 0; }
	.gate { font-weight: 400; }

	/* Results */
	.winner { position: relative; padding-top: 8px; }
	.wname { line-height: 0.86; margin: 0 0 12px; overflow-wrap: anywhere; }
	.stamp {
		margin-left: auto; align-self: center;
		display: flex; flex-direction: column; align-items: center;
		border: 3px solid var(--paper); border-radius: 4px; padding: 6px 12px 4px;
		transform: rotate(12deg); color: var(--paper);
	}
	.stamp .display { font-size: 1.55rem; letter-spacing: 0.1em; line-height: 1; }
	.stamp .mono { font-size: 0.55rem; }
	.final { display: flex; align-items: baseline; gap: 10px; }
	.big { font-size: 3rem; line-height: 1; }
	.over { margin: 4px 0 0; }
	.dash { font-size: 2rem; color: var(--muted); }
	.lose { opacity: 0.55; }
	.title { color: var(--dim); margin: 8px 0 0; }
	.board { background: var(--ink-2); border-radius: var(--radius); padding: 18px 16px; display: grid; gap: 16px; }
	.board-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.board-head h2 { margin: 0; }
	.keys { display: flex; align-items: center; gap: 6px; color: var(--dim); }
	.keys i { width: 10px; height: 10px; display: inline-block; margin-left: 8px; }
	.brow { display: grid; grid-template-columns: 76px 1fr; align-items: center; gap: 10px; }
	.cat { font-size: 1.1rem; color: var(--dim); }
	.bars { display: grid; gap: 4px; }
	.bar { display: flex; align-items: center; gap: 8px; }
	.fill { height: 14px; border-radius: 1px; max-width: calc(100% - 40px); }
	.val { color: var(--paper); }
	.val.lose { color: var(--muted); opacity: 1; }
	.replay { display: grid; gap: 8px; }

	/* Comments */
	.comments { list-style: none; padding: 0; margin: 16px 0 0; }
	.comments li { border-top: 1px solid var(--line); padding: 12px 0; }
	.cmeta { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.cmeta a { color: var(--paper); text-decoration: none; }
	.actions { display: flex; gap: 10px; align-items: center; font-weight: 400; }
	.comments .body { margin: 6px 0; color: var(--dim); white-space: pre-wrap; overflow-wrap: anywhere; }
	.report-battle { margin-top: 8px; }
</style>
