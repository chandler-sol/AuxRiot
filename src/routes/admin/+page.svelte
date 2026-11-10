<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	function until(t: number) {
		const m = Math.max(1, Math.round((t - Date.now()) / 60000));
		return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
	}
	const fmt = (t: number) =>
		new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });

	function targetLink(type: string, id: string) {
		if (type === 'battle') return `/battles/${id}`;
		if (type === 'user') return `/u/${id}`;
		return null;
	}
</script>

<svelte:head><title>Admin · AuxRiot</title></svelte:head>

<h1>Admin</h1>

{#if data.userStats}
	{@const u = data.userStats}
	<section class="users" aria-label="User counts">
		<div class="big"><span class="display">{u.total}</span><span class="mono">Registered users</span></div>
		<div><span class="display">{u.today}</span><span class="mono">New today</span></div>
		<div><span class="display">{u.week}</span><span class="mono">New this week</span></div>
		<div><span class="display">{u.confirmed}</span><span class="mono">Confirmed email</span></div>
		<div><span class="display">{u.battlers}</span><span class="mono">Have battled</span></div>
		<div><span class="display">{u.voters}</span><span class="mono">Have voted</span></div>
		<div><span class="display">{u.news}</span><span class="mono">News opt-ins</span></div>
	</section>
{/if}

<p><a class="btn primary" href="/admin/news">Compose AuxRiot news →</a></p>
<h2 class="mod-h">Moderation</h2>
{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

<section class="card stack">
	<h2>Promoted battles</h2>
	<p class="muted small">
		{data.promoSlots} slots run at once above the feed. Each booking automatically takes the earliest opening in either slot,
		starts and stops on its own, and ends early if the battle closes. Times are in your local time.
	</p>
	{#if form?.booked}
		{@const bk = form.booked}
		<div class="booked">
			<span class="display">Slot {bk.slot}</span>
			<span>
				{bk.startsNow ? 'Live now' : `Starts in ${until(bk.startsAt)} (${fmt(bk.startsAt)})`} · runs {bk.hours} hour{bk.hours > 1 ? 's' : ''}, until
				{fmt(bk.endsAt)}
			</span>
		</div>
	{/if}
	<form method="POST" action="?/promote" class="stack" use:enhance={keep}>
		<input name="battle" type="text" placeholder="Battle URL or ID" required />
		<div class="row">
			<select name="hours" style="flex:1;min-width:120px">
				{#each Array.from({ length: data.promoMaxHours }, (_, i) => i + 1) as h (h)}
					<option value={h}>{h} hour{h > 1 ? 's' : ''}</option>
				{/each}
			</select>
			<button class="primary">Book next open slot</button>
		</div>
	</form>

	{#each data.promos as p (p.id)}
		{@const live = p.starts_at <= data.now}
		<div class="row spread item small">
			<span>
				<span class="pill" class:voting={live}>{p.slot ? `Slot ${p.slot} · ` : ''}{live ? 'running' : `starts in ${until(p.starts_at)}`}</span>
				<a href="/battles/{p.battle_id}">{p.creator} vs {p.challenger ?? '???'}</a>
				<br /><span class="muted">{fmt(p.starts_at)} → {fmt(p.ends_at)} · {p.source}</span>
			</span>
			<form method="POST" action="?/cancelPromo" use:enhance={keep}>
				<input type="hidden" name="id" value={p.id} />
				<button>Cancel</button>
			</form>
		</div>
	{:else}
		<p class="muted small">No promos running or scheduled.</p>
	{/each}
	<p class="muted small">Battle results on record for future credit awards: {data.outcomesRecorded}</p>
</section>

<section class="card stack">
	<h2>Voting eligibility</h2>
	<p class="muted small">
		How old an account must be before it can vote. Lower it during launches or growth pushes so newcomers can join in;
		raise it when the crowd is big enough that fresh alt accounts are the bigger risk. Changes apply instantly.
	</p>
	<p>
		Current: <strong>{data.voterMinAgeHours === 0 ? 'no waiting period' : `${data.voterMinAgeHours} hours`}</strong>
		{#if data.voterMinAgeHours >= 48}<span class="muted small">({+(data.voterMinAgeHours / 24).toFixed(1)} days)</span>{/if}
	</p>
	<form method="POST" action="?/voterAge" class="row" use:enhance={keep}>
		{#each [[0, 'None'], [24, '24 hours'], [72, '3 days'], [168, '7 days']] as [h, label] (h)}
			<button name="hours" value={h} class:primary={data.voterMinAgeHours === h}>{label}</button>
		{/each}
	</form>
	<form method="POST" action="?/voterAge" class="row" use:enhance={keep}>
		<input name="hours" type="number" min="0" max="2160" step="1" placeholder="Custom hours" required style="flex:1;min-width:140px" />
		<button>Set</button>
	</form>
</section>

<section class="card stack">
	<h2>Shadowban</h2>
	<p class="muted small">Shadowbanned users see nothing different, but their votes count for zero and their comments are hidden from everyone else.</p>
	<form method="POST" action="?/shadowban" class="row" use:enhance={keep}>
		<input name="username" type="text" placeholder="username" required style="flex:1;min-width:160px" />
		<button name="on" value="1">Shadowban</button>
		<button name="on" value="0">Restore</button>
	</form>
	{#if data.banned.length}<p class="small muted">Currently shadowbanned: {data.banned.join(', ')}</p>{/if}
</section>

<section class="card stack">
	<h2>Open reports ({data.reports.length})</h2>
	{#each data.reports as r (r.id)}
		{@const link = targetLink(String(r.target_type), String(r.target_id))}
		<div class="item">
			<div class="row spread small">
				<strong>{String(r.reason).replace('_', ' ')}</strong>
				<span class="muted">by {r.reporter} · {ago(Number(r.created_at))}</span>
			</div>
			<div class="small">
				{r.target_type}: {#if link}<a href={link}>{r.target_id}</a>{:else}{r.target_id}{/if}
			</div>
			{#if r.details}<p class="small">{r.details}</p>{/if}
			<form method="POST" action="?/report" class="row" use:enhance={keep}>
				<input type="hidden" name="id" value={r.id} />
				<button name="status" value="actioned">Mark actioned</button>
				<button name="status" value="dismissed">Dismiss</button>
			</form>
		</div>
	{:else}
		<p class="muted">Nothing to review.</p>
	{/each}
</section>

<section class="card stack">
	<h2>Linked accounts</h2>
	<p class="muted small">Accounts that share an IP address or device. Shared IPs can be innocent (roommates, campus wifi); shared devices rarely are.</p>
	{#each data.linked as l (l.kind + l.value_hash)}
		<div class="row spread item small">
			<span><span class="pill">{l.kind}</span> {l.users}</span>
			{#if l.any_banned}<span class="muted">has banned member</span>{/if}
		</div>
	{:else}
		<p class="muted">No overlaps detected.</p>
	{/each}
</section>

<section class="card stack">
	<h2>Discounted votes</h2>
	{#each data.discounted as v (v.battle_id + v.voter)}
		<div class="row spread item small">
			<span><strong>{v.voter}</strong> on <a href="/battles/{v.battle_id}">{v.title}</a></span>
			<span class="muted">weight {v.weight} · {v.flags || 'manual'}</span>
		</div>
	{:else}
		<p class="muted">None.</p>
	{/each}
</section>

<section class="card stack">
	<h2>DMCA notices ({data.dmca.length})</h2>
	{#each data.dmca as d (d.id)}
		<div class="item stack">
			<div class="row spread small">
				<a href="/battles/{d.battle_id}">Battle {d.battle_id}</a>
				<span class="muted">{ago(Number(d.created_at))}</span>
			</div>
			<p class="small">
				<strong>{d.claimant_name}</strong> &lt;{d.claimant_email}&gt; · beat: {d.slot === null ? 'unspecified' : d.slot === 0 ? 'original' : 'challenger'}
			</p>
			<p class="small">{d.work_description}</p>
			<form method="POST" action="?/dmca" class="row" use:enhance={keep}>
				<input type="hidden" name="id" value={d.id} />
				<button name="decision" value="remove0">Remove original</button>
				<button name="decision" value="remove1">Remove challenger</button>
				<button name="decision" value="removeBoth">Remove both</button>
				<button name="decision" value="reject">Reject</button>
			</form>
		</div>
	{:else}
		<p class="muted">No open notices.</p>
	{/each}
</section>

<style>
	section { margin-bottom: 16px; }
	.users {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; margin: 8px 0 20px;
		background: var(--paper); color: var(--ink); border-radius: var(--radius); padding: 4px;
	}
	.users div { display: flex; flex-direction: column; align-items: center; padding: 12px 4px 10px; text-align: center; }
	.users .big { grid-column: 1 / -1; border-bottom: 1.5px dashed rgba(14, 13, 11, 0.25); padding-bottom: 14px; }
	.users .display { font-size: 2.2rem; line-height: 1; }
	.users .big .display { font-size: 4rem; color: var(--pink); }
	.users .mono { color: #5a544b; font-size: 0.58rem; margin-top: 4px; }
	.mod-h { margin-top: 24px; }
	.item { border-top: 1px solid var(--border); padding-top: 10px; }
	.booked { display: flex; gap: 12px; align-items: center; background: var(--paper); color: var(--ink); padding: 10px 14px; border-radius: var(--radius); }
	.booked .display { font-size: 1.6rem; }
	.item button { min-height: 34px; padding: 0 12px; font-size: 0.85rem; }
</style>
