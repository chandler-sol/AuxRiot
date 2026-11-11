<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago, timeLeft } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const b = $derived(data.battle);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	const confirmIt = (msg: string) => (e: SubmitEvent) => {
		if (!confirm(msg)) e.preventDefault();
	};
	const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	const FLAG: Record<string, string> = {
		shadowbanned: 'Shadowbanned voter',
		shared_device: 'Same device as a battler',
		shared_ip: 'Same IP as a battler',
		one_sided_history: 'Always picks the same producer',
		mod_discounted: 'Zeroed by a mod',
		mod_half: 'Halved by a mod',
		mod_restored: 'Restored by a mod'
	};
	const LABEL: Record<string, string> = { voting: 'Live vote', open: 'Open — no challenger', closed: 'Final', removed: 'Removed', expired: 'Expired' };
	const name = (slot: number) => (slot === 0 ? b.creator : (b.challenger ?? '???'));
	const judged = $derived(b.status === 'voting' || b.status === 'closed');
	const counted = $derived(data.ballots.filter((v) => v.weight > 0 && !v.shadowbanned).length);
</script>

<svelte:head><title>{b.creator} vs {b.challenger ?? '???'} · AuxRiot mod</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Mod tools</a> — <a href="/admin/battles">Battles</a></p>
<h1 class="headline">{b.creator} <span class="vs">vs</span> {b.challenger ?? '???'}</h1>
<p class="sub">"{b.title}" · <a href="/battles/{b.id}">Public page →</a></p>

<div class="status mono">
	<span class="st st-{b.status}">{LABEL[b.status] ?? b.status}</span>
	{#if b.status === 'voting' && b.votingEndsAt}<span>{timeLeft(b.votingEndsAt - data.now)} · closes {fmt(b.votingEndsAt)}</span>{/if}
	<span>{data.ballots.length} ballot{data.ballots.length === 1 ? '' : 's'} ({counted} counting)</span>
	<span>{data.comments.total} comments{data.comments.held ? ` · ${data.comments.held} held` : ''}</span>
	<span>{b.views} views</span>
	<span>Posted {ago(b.createdAt, data.now)}</span>
</div>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

{#if data.reports.length}
	<section class="card stack reports">
		<h2>Open reports ({data.reports.length})</h2>
		{#each data.reports as r (r.id)}
			<p class="small"><strong>{r.reason.replace('_', ' ')}</strong> on the {r.target_type} · by {r.reporter} · {ago(r.created_at, data.now)}{#if r.details}<br /><span class="muted">{r.details}</span>{/if}</p>
		{/each}
		<a class="small" href="/admin/reports">Handle in Reports →</a>
	</section>
{/if}

{#if b.result}
	<section class="card result">
		{#each [0, 1] as s (s)}
			<div class:win={b.winnerId === (s === 0 ? b.creatorId : b.challengerId)}>
				<span class="mono">{name(s)}</span>
				<span class="display">{b.result.slots[s].total.toFixed(2)}</span>
			</div>
		{/each}
		<p class="mono muted small">{b.winnerId ? `${b.winnerId === b.creatorId ? b.creator : b.challenger} won` : 'Tie'} · {b.result.countedVotes} counted votes</p>
	</section>
{/if}

<section class="card stack">
	<h2>Beats</h2>
	{#each data.entries as e (e.id)}
		<div class="beat">
			<div class="row spread">
				<strong>{name(e.slot)}</strong>
				<span class="mono muted small">{Math.round(e.duration_ms / 1000)}s · {e.slot === 0 ? 'Corner A' : 'Corner B'}</span>
			</div>
			{#if e.src}
				<audio controls preload="none" src={e.src}></audio>
				{#if b.status !== 'removed'}
					<details>
						<summary class="small">Delete this beat…</summary>
						<form method="POST" action="?/removeBeat" class="stack" use:enhance={keep} onsubmit={confirmIt(`Delete ${name(e.slot)}'s beat for good? The battle will be pulled.`)}>
							<input type="hidden" name="slot" value={e.slot} />
							<input name="note" type="text" maxlength="300" required placeholder="Reason — e.g. stolen beat, uncleared sample" />
							<button class="danger">Delete beat &amp; pull battle</button>
						</form>
					</details>
				{/if}
			{:else}
				<p class="muted small">Audio deleted.</p>
			{/if}
		</div>
	{/each}
</section>

<section class="card stack">
	<h2>Battle controls</h2>
	{#if b.status === 'voting'}
		<form method="POST" action="?/clock" class="stack" use:enhance={keep}>
			<label for="hrs">Clock</label>
			<div class="row">
				<input type="hidden" name="mode" value="shift" />
				{#each [-12, -1, 1, 12, 24] as h (h)}
					<button name="hours" value={h}>{h > 0 ? '+' : '−'}{Math.abs(h)}h</button>
				{/each}
			</div>
		</form>
		<form method="POST" action="?/clock" class="row" use:enhance={keep}>
			<input type="hidden" name="mode" value="from_now" />
			<input id="hrs" name="hours" type="number" min="1" max="168" step="1" placeholder="Close in N hours" required style="flex:1;min-width:140px" />
			<button>Set</button>
		</form>
		<form method="POST" action="?/endNow" class="row" use:enhance={keep} onsubmit={confirmIt('End voting now and publish the result?')}>
			<input name="note" type="text" maxlength="300" placeholder="Why (optional)" style="flex:1;min-width:160px" />
			<button class="primary">End voting now</button>
		</form>
	{/if}
	{#if b.status === 'closed'}
		<form method="POST" action="?/recount" class="row" use:enhance={keep}>
			<input name="note" type="text" maxlength="300" placeholder="Why (optional)" style="flex:1;min-width:160px" />
			<button>Recount result</button>
		</form>
		<p class="small muted">Recounting re-scores with today's ballots and shadowbans, then fixes both W-L records and credits.</p>
	{/if}
	{#if b.status === 'removed'}
		<form method="POST" action="?/restore" class="row" use:enhance={keep}>
			<input name="note" type="text" maxlength="300" placeholder="Why (optional)" style="flex:1;min-width:160px" />
			<button class="primary">Restore battle</button>
		</form>
	{:else}
		<details>
			<summary class="small">Remove this battle…</summary>
			<form method="POST" action="?/void" class="stack" use:enhance={keep} onsubmit={confirmIt('Remove this battle from the site?')}>
				<input name="note" type="text" maxlength="300" required placeholder="Reason (goes in the mod log)" />
				<button class="danger">Remove battle{b.status === 'closed' ? ' & reverse result' : ''}</button>
				<p class="small muted">
					Hides it everywhere and stops its promos (unstarted credit promos are refunded).
					{#if b.status === 'closed'}Both producers' W-L records and battle credits from it are reversed.{/if}
					Audio is kept, so it can be restored.
				</p>
			</form>
		</details>
	{/if}
	{#if data.promos.length}
		<p class="small muted">Promoted: {#each data.promos as p, i (i)}{i ? ', ' : ''}slot {p.slot ?? '?'} {fmt(p.starts_at)}–{fmt(p.ends_at)} ({p.source}){/each}</p>
	{/if}
</section>

<section class="card stack">
	<h2>Ballots ({data.ballots.length})</h2>
	{#if b.status === 'closed'}<p class="small warn">This battle is final — changing a ballot recounts the result.</p>{/if}
	<p class="small muted">Totals are the 4-category sum (4–20) each voter gave each beat. Flagged and zeroed ballots are listed first.</p>
	{#each data.ballots as v (v.voterId)}
		{@const eff = v.shadowbanned ? 0 : v.weight}
		<div class="ballot" class:dim={eff === 0}>
			<div class="row spread">
				<span>
					<a class="display vname" href="/admin/users?q={encodeURIComponent(v.username)}">{v.username}</a>
					<span class="mono muted small">joined {ago(v.joined, data.now)}</span>
				</span>
				<span class="mono w" class:bad={eff < 1}>×{eff}</span>
			</div>
			<div class="mono scores">
				<span class:lead={v.a > v.b}>{b.creator} {v.a}</span>
				<span class:lead={v.b > v.a}>{b.challenger} {v.b}</span>
				<span class="muted">{ago(v.updatedAt, data.now)}</span>
			</div>
			{#if v.flags.length || v.shadowbanned || v.suspended}
				<div class="flags">
					{#if v.shadowbanned && !v.flags.includes('shadowbanned')}<span class="tag bad">Shadowbanned now</span>{/if}
					{#if v.suspended}<span class="tag bad">Suspended</span>{/if}
					{#each v.flags as f (f)}<span class="tag" class:bad={!f.startsWith('mod_restored')}>{FLAG[f] ?? f}</span>{/each}
				</div>
			{/if}
			{#if judged}
				<form method="POST" action="?/ballot" class="row acts" use:enhance={keep}>
					<input type="hidden" name="voter_id" value={v.voterId} />
					{#if v.weight !== 1}<button name="op" value="full">Count fully</button>{/if}
					{#if v.weight !== 0.5}<button name="op" value="half">Half</button>{/if}
					{#if v.weight !== 0}<button name="op" value="zero">Don't count</button>{/if}
					<button name="op" value="delete" class="ghost" onclick={(e) => { if (!confirm(`Delete ${v.username}'s ballot?`)) e.preventDefault(); }}>Delete</button>
				</form>
			{/if}
		</div>
	{:else}
		<p class="muted">No ballots yet.</p>
	{/each}
</section>

{#if data.log.length}
	<section class="card stack">
		<h2>History</h2>
		{#each data.log as l, i (i)}
			<p class="small"><span class="mono muted">{ago(l.created_at, data.now)}</span> <strong>{l.actor}</strong> {l.action}{l.details ? ` — ${l.details}` : ''}</p>
		{/each}
	</section>
{/if}

<style>
	section { margin-bottom: 14px; }
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.2rem, 10vw, 3.6rem); line-height: 0.92; overflow-wrap: anywhere; }
	.vs { color: var(--dim); font-size: 0.5em; }
	.sub { margin: 6px 0 10px; color: var(--dim); }
	.status { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--dim); font-weight: 400; font-size: 0.68rem; margin-bottom: 14px; align-items: center; }
	.st { border: 1px solid var(--line-2); border-radius: var(--radius); padding: 3px 8px 2px; color: var(--paper); }
	.st-voting { border-color: var(--pink); color: var(--pink); }
	.st-removed { border-color: #ff5a4e; color: #ff5a4e; }
	.reports { border: 1.5px solid #ff5a4e; }
	.result { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.result div { display: flex; flex-direction: column; align-items: center; padding: 10px; border-radius: var(--radius); background: var(--ink); }
	.result .win { outline: 2px solid var(--pink); }
	.result .display { font-size: 2.2rem; }
	.result p { grid-column: 1 / -1; margin: 0; text-align: center; }
	.beat { border-top: 1px solid var(--border); padding-top: 10px; display: grid; gap: 8px; }
	.beat:first-of-type { border-top: 0; padding-top: 0; }
	audio { width: 100%; }
	summary { cursor: pointer; color: var(--dim); }
	details form { margin-top: 8px; }
	.danger { border-color: #ff5a4e; color: #ff5a4e; }
	.danger:hover { background: #ff5a4e; color: var(--ink); }
	.warn { color: var(--warn); }
	.ballot { border-top: 1px solid var(--border); padding-top: 10px; display: grid; gap: 6px; }
	.ballot.dim .vname { color: var(--dim); }
	.vname { font-size: 1.3rem; color: var(--paper); text-decoration: none; margin-right: 6px; }
	.vname:hover { color: var(--pink); }
	.w { font-size: 0.9rem; }
	.bad { color: #ff5a4e; }
	.scores { display: flex; gap: 6px 14px; flex-wrap: wrap; color: var(--dim); font-weight: 400; font-size: 0.68rem; }
	.scores .lead { color: var(--paper); }
	.flags { display: flex; flex-wrap: wrap; gap: 6px; }
	.tag { border: 1px solid var(--line-2); border-radius: var(--radius); padding: 3px 8px 2px; color: var(--dim); font-family: var(--mono); font-size: 0.6rem; text-transform: uppercase; }
	.tag.bad { border-color: #ff5a4e; color: #ff5a4e; }
	.acts button, .beat button, section > form button { min-height: 36px; padding: 0 12px; font-size: 0.9rem; }
	.ghost { color: var(--dim); }
</style>
