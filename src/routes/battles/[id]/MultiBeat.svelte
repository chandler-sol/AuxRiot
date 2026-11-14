<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Player from '#lib/components/Player.svelte';
	import Scorecard from '#lib/components/Scorecard.svelte';
	import BeatSet from '#lib/components/BeatSet.svelte';
	import Uploader from '#lib/components/Uploader.svelte';
	import CopyrightNotice from '#lib/components/CopyrightNotice.svelte';
	import ShareChallenge from '#lib/components/ShareChallenge.svelte';
	import type { PreparedAudio } from '#lib/audio-prep.ts';
	import type { ActionData, PageData } from './$types';

	let {
		data,
		form,
		names,
		now,
		listened = $bindable({})
	}: { data: PageData; form: ActionData; names: [string, string]; now: number; listened: Record<string, number> } = $props();

	const COLORS = ['var(--a)', 'var(--b)'];
	const b = $derived(data.battle);
	const rounds = $derived(data.format.rounds);
	const roundEntries = (r: number) => data.entries.filter((e) => e.round === r).sort((x, y) => x.slot - y.slot);
	const setRounds = $derived(Array.from({ length: rounds }, (_, i) => i + 1));
	const otRound = $derived(rounds + 1);
	const blank = () => ({ drums: 0, melody: 0, mix: 0, overall: 0 });
	type Sc = { drums: number; melody: number; mix: number; overall: number };

	// Per-round scorecards, seeded from what the judge already saved. Seeded
	// synchronously too, since effects don't run during server render.
	const seedRounds = () =>
		Object.fromEntries(
			Array.from({ length: data.format.rounds }, (_, i) => i + 1).map((r) => [r, data.roundVotes[r] ? structuredClone(data.roundVotes[r]) : [blank(), blank()]])
		) as Record<number, [Sc, Sc]>;
	const seedOt = (): [Sc, Sc] => (data.overtime?.myVote ? structuredClone(data.overtime.myVote) : [blank(), blank()]);
	let roundScores = $state<Record<number, [Sc, Sc]>>(seedRounds());
	let otScores = $state<[Sc, Sc]>(seedOt());
	let wantsOt = $state(untrack(() => data.wantsOt));
	let seeded = untrack(() => data.battle.id);
	$effect.pre(() => {
		if (seeded === b.id) return;
		seeded = b.id;
		roundScores = seedRounds();
		otScores = seedOt();
		wantsOt = data.wantsOt;
	});
	const saved = $derived(Object.keys(data.roundVotes).map(Number).filter((r) => r <= rounds));
	const scoredCount = $derived(saved.length);
	const heard = (r: number) => {
		const es = roundEntries(r);
		return es.length === 2 && es.every((e) => (listened[e.id] ?? 0) >= e.durationMs * data.threshold);
	};
	const rated = (s: [Sc, Sc] | undefined) => !!s && s.every((x) => x.drums && x.melody && x.mix && x.overall);
	const canJudge = $derived(!data.voteBlock && !!data.user);
	let busy = $state<number | null>(null);

	// Answering: all N beats at once, in order.
	let answerSlots = $state<{ id: number; prepared: PreparedAudio | null }[]>([]);
	const answerReady = $derived(answerSlots.length === rounds && answerSlots.every((s) => s.prepared));
	let answering = $state(false);

	// Overtime drop.
	let otPrepared = $state<PreparedAudio | null>(null);
	let otBusy = $state(false);
	const ot = $derived(data.overtime);
	const amBattler = $derived(!!data.user && (data.user.id === b.creatorId || data.user.id === b.challengerId));
	function hms(ms: number) {
		if (ms <= 0) return '00:00:00';
		const s = Math.floor(ms / 1000);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
	}
	const fx = (n: number) => n.toFixed(2);
</script>

{#snippet pair(r: number, judging: boolean)}
	{@const es = roundEntries(r)}
	<div class="pair">
		{#each es as e (e.id)}
			{#if e.src}
				<Player
					variant="compact"
					src={e.src}
					peaks={e.peaks}
					durationMs={e.durationMs}
					name={names[e.slot]}
					accent={COLORS[e.slot]}
					entryId={judging ? e.id : undefined}
					bind:listenedMs={listened[e.id]}
					threshold={data.threshold}
					previewSeconds={data.previewSeconds ?? undefined}
				/>
			{:else}
				<p class="muted small">{names[e.slot]}'s round {r} beat was removed after a copyright takedown.</p>
			{/if}
		{/each}
	</div>
{/snippet}

<section class="mb" id="overtime">
	<div class="mb-head">
		<span class="display fmt">{data.format.label}</span>
		<span class="mono muted">{rounds} beats each · best total across all {rounds} rounds · credits ×{data.format.multiplier}</span>
	</div>

	{#if b.status === 'open'}
		<!-- OPEN CHALLENGE -->
		{#if data.user?.id === b.creatorId}
			{#each setRounds as r (r)}
				<div class="round">
					<p class="display rlabel">Round {r}</p>
					{@render pair(r, false)}
				</div>
			{/each}
			<div class="waiting">
				<p class="display">Waiting for a challenger.</p>
				<p class="muted small">Challengers hear a 10-second taste of round 1 — rounds 2–{rounds} stay hidden until someone answers with {rounds} beats.</p>
				<ShareChallenge id={b.id} title={b.title} username={b.creator} />
			</div>
		{:else}
			<div class="round">
				<p class="display rlabel">Round 1 <span class="mono small muted">· 10-second taste</span></p>
				{@render pair(1, false)}
			</div>
			{#if data.hiddenRounds}
				<p class="hidden-rounds mono small">🔒 Rounds 2–{rounds} are revealed when someone answers.</p>
			{/if}
			{#if data.canRespond}
				<form
					method="POST"
					action="?/respond"
					enctype="multipart/form-data"
					class="answer stack"
					id="answer"
					use:enhance={({ formData, cancel }) => {
						if (!answerReady) return cancel();
						answerSlots.forEach((sl, i) => {
							formData.set(`audio_${i}`, sl.prepared!.blob, `round-${i + 1}.mp3`);
							formData.set(`peaks_${i}`, JSON.stringify(sl.prepared!.peaks));
						});
						answering = true;
						return async ({ update }) => {
							await update({ reset: false });
							answering = false;
						};
					}}
				>
					<h2>Think you can take the set?</h2>
					<p class="muted small">Answer with {rounds} beats, in the order you want them to face off. The first full answer locks in the battle and starts a {b.voteHours}h vote.</p>
					<BeatSet {rounds} bind:slots={answerSlots} />
					<CopyrightNotice />
					{#if form?.respondError}<p class="error">{form.respondError}</p>{/if}
					<button class="primary full" disabled={!answerReady || answering}>{answering ? 'Uploading…' : `Answer with ${rounds} beats`}</button>
				</form>
			{:else if !data.user}
				<p class="muted"><a href="/signup?next=/battles/{b.id}%23answer">Sign up</a> or <a href="/login?next=/battles/{b.id}%23answer">log in</a> to answer this {data.format.label.toLowerCase()}.</p>
			{/if}
		{/if}
	{:else if b.status === 'voting'}
		<!-- LIVE: score each round -->
		{#if canJudge}
			<div class="progress">
				<span class="mono">Your ballot: {scoredCount} of {rounds} rounds scored</span>
				<div class="pbar"><span style:width="{(scoredCount / rounds) * 100}%"></span></div>
				<p class="small muted">{scoredCount === rounds ? 'Your ballot counts. You can still change any round until voting closes.' : 'It counts once every round is scored — your progress saves, so you can come back.'}</p>
			</div>
		{/if}
		{#each setRounds as r (r)}
			<div class="round" class:done={saved.includes(r)}>
				<p class="display rlabel">Round {r}{#if saved.includes(r)}<span class="mono small check"> ✓ scored</span>{/if}</p>
				{@render pair(r, canJudge)}
				{#if canJudge}
					<form
						method="POST"
						action="?/voteRound"
						class="stack rform"
						use:enhance={() => {
							busy = r;
							return async ({ update }) => {
								await update({ reset: false });
								busy = null;
							};
						}}
					>
						<input type="hidden" name="round" value={r} />
						<input type="hidden" name="wants_ot" value={wantsOt ? 'on' : ''} />
						<Scorecard {names} bind:scores={roundScores[r]} />
						{#if !heard(r)}
							<p class="mono muted gate">Hear 75% of both round {r} beats to score it.</p>
						{/if}
						{#if form?.voteError && form?.voteRound === r}<p class="error small">{form.voteError}</p>{/if}
						<button class="primary full" disabled={!heard(r) || !rated(roundScores[r]) || busy === r}>
							{busy === r ? 'Saving…' : saved.includes(r) ? `Update round ${r}` : `Save round ${r}`}
						</button>
					</form>
				{/if}
			</div>
		{/each}
		{#if canJudge}
			<form method="POST" action="?/wantsOt" class="otask" use:enhance={() => async ({ update }) => update({ reset: false })}>
				<input type="hidden" name="on" value={wantsOt ? '0' : '1'} />
				<label class="check">
					<input type="checkbox" checked={wantsOt} onchange={(e) => { wantsOt = (e.currentTarget as HTMLInputElement).checked; if (scoredCount === rounds) (e.currentTarget as HTMLInputElement).form?.requestSubmit(); }} />
					<span><strong>Too close — I want overtime.</strong> If most judges ask (at least 5), the battlers each drop one more beat to settle it.</span>
				</label>
			</form>
		{/if}
	{:else if b.status === 'overtime' && ot}
		<!-- OVERTIME -->
		<div class="otcard">
			<p class="mono otk">{ot.mode === 'forced' ? 'The judges called for overtime' : 'Too close to call'}</p>
			<h2 class="display">Overtime</h2>
			{#if ot.base}
				<p class="mono small">Set score: {names[0]} {fx(ot.base.slots[0].total)} — {fx(ot.base.slots[1].total)} {names[1]}</p>
			{/if}
			{#if ot.status === 'offered'}
				<p class="small">
					Both battlers have <strong>{hms((ot.deadline ?? 0) - now)}</strong> to drop one more beat. Neither hears the other's until both are in.
					{ot.mode === 'forced' ? 'If only one submits, they take the battle.' : "If both don't submit, it stays a tie."}
				</p>
				<p class="mono small muted">{ot.submitted.filter(Boolean).length} of 2 beats in</p>
				{#if amBattler && !ot.mine}
					<form
						method="POST"
						action="?/submitOt"
						enctype="multipart/form-data"
						class="stack"
						use:enhance={({ formData, cancel }) => {
							if (!otPrepared) return cancel();
							formData.set('audio', otPrepared.blob, 'overtime.mp3');
							formData.set('peaks', JSON.stringify(otPrepared.peaks));
							otBusy = true;
							return async ({ update }) => {
								await update({ reset: false });
								otBusy = false;
							};
						}}
					>
						<Uploader bind:prepared={otPrepared} />
						<CopyrightNotice />
						{#if form?.otError}<p class="error small">{form.otError}</p>{/if}
						<button class="primary full" disabled={!otPrepared || otBusy}>{otBusy ? 'Uploading…' : 'Run it back — drop my overtime beat'}</button>
					</form>
				{:else if amBattler && ot.mine}
					<p class="success small">Your overtime beat is in. Waiting on your opponent.</p>
				{/if}
			{:else if ot.status === 'voting'}
				<p class="small">Both beats are in. Judges have <strong>{hms((ot.endsAt ?? 0) - now)}</strong> to score this one round — it decides the battle.</p>
				<div class="round">
					<p class="display rlabel">Overtime round</p>
					{@render pair(otRound, canJudge)}
					{#if canJudge}
						<form method="POST" action="?/voteOt" class="stack rform" use:enhance={() => { busy = otRound; return async ({ update }) => { await update({ reset: false }); busy = null; }; }}>
							<Scorecard {names} bind:scores={otScores} />
							{#if !heard(otRound)}<p class="mono muted gate">Hear 75% of both overtime beats to score it.</p>{/if}
							{#if form?.voteError}<p class="error small">{form.voteError}</p>{/if}
							{#if form?.otVoted}<p class="success small">Overtime vote saved.</p>{/if}
							<button class="primary full" disabled={!heard(otRound) || !rated(otScores) || busy === otRound}>
								{busy === otRound ? 'Saving…' : ot.myVote ? 'Update overtime vote' : 'Lock in overtime vote'}
							</button>
						</form>
					{:else if data.voteBlock === 'participant'}
						<p class="muted small">You're in this battle, so you can't vote.</p>
					{:else if data.voteBlock === 'login'}
						<p class="muted small"><a href="/login?next=/battles/{b.id}">Log in</a> to vote.</p>
					{/if}
				</div>
			{/if}
		</div>
	{:else if b.status === 'closed' && b.result?.rounds}
		<!-- RESULTS: round by round -->
		{@const r = b.result}
		<table class="rtable">
			<thead><tr><th></th><th style:color={COLORS[0]}>{names[0]}</th><th style:color={COLORS[1]}>{names[1]}</th></tr></thead>
			<tbody>
				{#each r.rounds ?? [] as rd, i (i)}
					{@const w = rd.slots[0].total === rd.slots[1].total ? -1 : rd.slots[0].total > rd.slots[1].total ? 0 : 1}
					<tr><td class="mono">Round {i + 1}</td><td class:win={w === 0}>{fx(rd.slots[0].total)}</td><td class:win={w === 1}>{fx(rd.slots[1].total)}</td></tr>
				{/each}
				<tr class="tot"><td class="mono">Set</td><td>{fx(r.slots[0].total)}</td><td>{fx(r.slots[1].total)}</td></tr>
				{#if r.overtime}
					<tr class="otrow">
						<td class="mono">Overtime</td>
						{#if r.overtime.slots && r.overtime.outcome !== 'no_votes'}
							<td class:win={r.overtime.slots[0].total > r.overtime.slots[1].total}>{fx(r.overtime.slots[0].total)}</td>
							<td class:win={r.overtime.slots[1].total > r.overtime.slots[0].total}>{fx(r.overtime.slots[1].total)}</td>
						{:else}
							<td colspan="2" class="mono small">
								{r.overtime.outcome === 'forfeit' ? `${names[r.overtime.submitted[0] ? 0 : 1]} won by forfeit — only they dropped an overtime beat` : r.overtime.outcome === 'declined' ? (r.overtime.mode === 'forced' ? 'Neither dropped an overtime beat — the set result stands' : 'Not both battlers ran it back — it stays a tie') : 'No counted overtime votes'}
							</td>
						{/if}
					</tr>
				{/if}
			</tbody>
		</table>
		<div class="replays">
			<h2>Run it back</h2>
			{#each setRounds as rr (rr)}
				<p class="mono small rr">Round {rr}</p>
				{@render pair(rr, false)}
			{/each}
			{#if roundEntries(otRound).length}
				<p class="mono small rr">Overtime</p>
				{@render pair(otRound, false)}
			{/if}
		</div>
	{/if}
</section>

<style>
	.mb { display: grid; gap: 14px; margin-bottom: 24px; }
	.mb-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
	.fmt { font-size: 1.6rem; color: var(--pink); }
	.mb-head .mono { font-size: 0.66rem; font-weight: 400; }
	.round { background: var(--ink-2); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 10px; border-left: 4px solid var(--line-2); }
	.round.done { border-left-color: var(--pink); }
	.rlabel { font-size: 1.35rem; margin: 0; }
	.check { color: var(--pink); }
	.pair { display: grid; gap: 8px; }
	.rform { border-top: 1.5px dashed var(--line-2); padding-top: 10px; }
	.gate { margin: 0; font-size: 0.68rem; font-weight: 400; }
	.hidden-rounds { color: var(--dim); margin: 0; }
	.waiting { background: var(--ink-2); border-radius: var(--radius); padding: 14px; display: grid; gap: 8px; }
	.waiting .display { font-size: 1.5rem; margin: 0; }
	.waiting p { margin: 0; }
	.answer { background: var(--ink-2); border-radius: var(--radius); padding: 14px; border-top: 4px solid var(--b); }
	.answer h2 { margin: 0; }
	.progress { display: grid; gap: 6px; }
	.progress .mono { font-size: 0.7rem; }
	.progress p { margin: 0; }
	.pbar { height: 8px; border-radius: 999px; background: var(--ink-2); overflow: hidden; }
	.pbar span { display: block; height: 100%; background: var(--pink); transition: width 0.3s; }
	.otask .check { display: flex; gap: 10px; align-items: flex-start; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-size: 0.92rem; color: var(--dim); font-weight: 400; cursor: pointer; }
	.otask .check strong { color: var(--paper); }
	.otask input { width: 20px; height: 20px; accent-color: var(--pink); flex: none; margin-top: 2px; }
	.otcard { background: var(--paper); color: var(--ink); border-radius: var(--radius); padding: 16px; display: grid; gap: 10px; }
	.otcard h2 { font-size: 2.6rem; line-height: 0.9; margin: 0; color: var(--ink); }
	.otk { margin: 0; color: #a3123f; font-size: 0.68rem; }
	.otcard p { margin: 0; }
	.otcard .muted { color: #5a544b; }
	.otcard .round { background: var(--ink); color: var(--paper); }
	/* The rights notice is styled for dark backgrounds; recolor it on the cream card. */
	.otcard :global(.notice) { color: #5a544b; border-left-color: #b9b0a2; }
	.otcard :global(.notice strong), .otcard :global(.ack) { color: var(--ink); }
	.otcard :global(.notice a) { color: var(--ink); }
	.rtable { width: 100%; border-collapse: collapse; font-family: var(--display); }
	.rtable th, .rtable td { padding: 8px 10px; text-align: right; border-bottom: 1px solid var(--line); font-size: 1.2rem; }
	.rtable th:first-child, .rtable td:first-child { text-align: left; }
	.rtable td.mono { font-family: var(--mono); font-size: 0.7rem; color: var(--dim); }
	.rtable td.win { color: var(--pink); }
	.rtable .tot td { font-size: 1.5rem; border-top: 2px solid var(--paper); }
	.rtable .otrow td.small { font-family: var(--mono); color: var(--dim); text-align: left; }
	.replays { display: grid; gap: 8px; }
	.replays h2 { margin: 6px 0 0; }
	.rr { margin: 6px 0 0; color: var(--dim); }
</style>
