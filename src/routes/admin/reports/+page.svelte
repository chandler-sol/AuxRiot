<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	const REASON: Record<string, string> = {
		fake_votes: 'Fake votes',
		alt_account: 'Alt account',
		harassment: 'Harassment',
		spam: 'Spam',
		stolen_beat: 'Stolen beat',
		scam: 'Scam / off-site payment',
		other: 'Other'
	};
	const LABEL: Record<string, string> = { voting: 'Live', open: 'Open', closed: 'Final', removed: 'Removed', expired: 'Expired' };
	let suspending = $state<string | null>(null);
	let removing = $state<string | null>(null);
	const reasons = (rs: { reason: string }[]) => {
		const n: Record<string, number> = {};
		for (const r of rs) n[r.reason] = (n[r.reason] ?? 0) + 1;
		return Object.entries(n).map(([k, v]) => `${REASON[k] ?? k}${v > 1 ? ` ×${v}` : ''}`).join(' · ');
	};
</script>

<svelte:head><title>Reports · AuxRiot mod</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Mod tools</a> — Reports</p>
<h1 class="headline">{data.status === 'open' ? data.groups.length : 'Closed'} <span>{data.status === 'open' ? 'to review.' : 'reports.'}</span></h1>
<p class="mono small tabs">
	<a href="/admin/reports" class:on={data.status === 'open'}>Open</a>
	<a href="/admin/reports?status=closed" class:on={data.status === 'closed'}>Handled &amp; dismissed</a>
</p>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

{#snippet userActions(u: { id: string; username: string; shadowbanned: number; suspended_at: number | null; is_mod: number; is_admin: number } | null, label: string)}
	{#if u && data.status === 'open'}
		<div class="uacts">
			<span class="mono small">{label} <a href="/admin/users?q={encodeURIComponent(u.username)}">@{u.username}</a>
				{#if u.is_admin}<span class="tag">Admin</span>{:else if u.is_mod}<span class="tag">Mod</span>{/if}
				{#if u.shadowbanned}<span class="tag bad">Shadowbanned</span>{/if}
				{#if u.suspended_at}<span class="tag bad">Suspended</span>{/if}
			</span>
			{#if !u.is_admin && !u.is_mod}
				<form method="POST" action="?/user" class="row" use:enhance={keep}>
					<input type="hidden" name="user_id" value={u.id} />
					<button name="op" value={u.shadowbanned ? 'unshadowban' : 'shadowban'}>{u.shadowbanned ? 'Lift shadowban' : 'Shadowban'}</button>
					{#if u.suspended_at}
						<button name="op" value="unsuspend">Lift suspension</button>
					{:else}
						<button type="button" onclick={() => (suspending = suspending === u.id ? null : u.id)}>Suspend…</button>
					{/if}
				</form>
				{#if suspending === u.id}
					<form method="POST" action="?/user" class="row" use:enhance={() => async ({ update }) => { await update({ reset: false }); suspending = null; }}>
						<input type="hidden" name="user_id" value={u.id} />
						<input name="note" type="text" maxlength="300" placeholder="Reason they'll see — e.g. Harassment in comments" required style="flex:1;min-width:180px" />
						<button name="op" value="suspend" class="danger">Suspend</button>
					</form>
				{/if}
			{/if}
		</div>
	{/if}
{/snippet}

<ul class="list">
	{#each data.groups as g (g.type + g.id)}
		<li>
			<div class="head">
				<span class="mono kind">{g.type}</span>
				<strong class="why">{reasons(g.reports)}</strong>
				<span class="mono muted small">{g.reports.length} report{g.reports.length === 1 ? '' : 's'} · {ago(g.latest, data.now)}</span>
			</div>

			{#if g.comment}
				{@const c = g.comment}
				<blockquote class:gone={c.hidden}>
					<p>{c.body}</p>
					<footer class="mono small">@{c.author?.username ?? '?'} on <a href="/battles/{c.battleId}">"{c.title}"</a> · {ago(c.createdAt, data.now)}{c.hidden ? ' · hidden' : ''}</footer>
				</blockquote>
				{#if data.status === 'open'}
					<div class="row">
						{#if !c.hidden}
							<form method="POST" action="?/hideComment" use:enhance={keep}>
								<input type="hidden" name="id" value={c.id} />
								<button class="primary">Hide comment</button>
							</form>
						{/if}
						<a class="mono small" href="/admin/comments?user={encodeURIComponent(c.author?.username ?? '')}">Their other comments →</a>
					</div>
				{/if}
				{@render userActions(c.author, 'Author')}
			{:else if g.battle}
				{@const b = g.battle}
				<div class="battle">
					<a class="display" href="/admin/battles/{b.id}">{b.creator} vs {b.challenger ?? '???'}</a>
					<span class="small muted">"{b.title}" · {LABEL[b.status] ?? b.status} · {b.votes} votes{b.flagged ? ` · ${b.flagged} discounted` : ''}</span>
				</div>
				{#if data.status === 'open'}
					<div class="row">
						<a class="btn primary" href="/admin/battles/{b.id}">Open battle panel</a>
						{#if b.status !== 'removed'}
							<button type="button" onclick={() => (removing = removing === b.id ? null : b.id)}>Remove…</button>
						{/if}
					</div>
					{#if removing === b.id}
						<form method="POST" action="?/removeBattle" class="row" use:enhance={keep}>
							<input type="hidden" name="id" value={b.id} />
							<input name="note" type="text" maxlength="300" required placeholder="Reason (goes in the mod log)" style="flex:1;min-width:180px" />
							<button class="danger">Remove battle{b.status === 'closed' ? ' & reverse result' : ''}</button>
						</form>
					{/if}
				{/if}
				{@render userActions(b.creatorUser, 'Corner A')}
				{@render userActions(b.challengerUser, 'Corner B')}
			{:else if g.message}
				{@const m = g.message}
				<p class="mono small muted">Private message{m.title ? ` about "${m.title}"` : ''} — shown to mods only because it was reported.</p>
				<ol class="thread">
					{#each m.context as x (x.id)}
						<li class:reported={x.id === m.id}><span class="mono">@{x.username}</span> {x.body}</li>
					{/each}
				</ol>
				{#if m.offPlatform}<p class="mono small warnc">Mentions contact or payment info (possible off-site deal)</p>{/if}
				{#if data.status === 'open' && !m.hidden}
					<form method="POST" action="?/hideMessage" use:enhance={keep}><input type="hidden" name="id" value={m.id} /><button class="primary">Hide message</button></form>
				{/if}
				{@render userActions(m.sender, 'Sender')}
			{:else if g.question}
				{@const q = g.question}
				<blockquote class:gone={q.hidden}>
					<p>{q.body}</p>
					{#if q.answer}<p class="small muted">Answer: {q.answer}</p>{/if}
					<footer class="mono small">Public question on <a href="/battles/{q.battleId}#buy">"{q.title}"</a> · {ago(q.createdAt, data.now)}{q.hidden ? ' · removed' : ''}</footer>
				</blockquote>
				{#if data.status === 'open' && !q.hidden}
					<form method="POST" action="?/hideQuestion" use:enhance={keep}><input type="hidden" name="id" value={q.id} /><button class="primary">Remove question</button></form>
				{/if}
				{@render userActions(q.author, 'Author')}
			{:else if g.user}
				{@render userActions(g.user, 'Reported user')}
			{:else}
				<p class="muted small">This {g.type} no longer exists.</p>
			{/if}

			<details class="who">
				<summary class="mono small">Who reported{g.reports.some((r) => r.details) ? ' & what they said' : ''}</summary>
				{#each g.reports as r (r.id)}
					<p class="small"><strong>{r.reporter}</strong> · {REASON[r.reason] ?? r.reason} · {ago(r.created_at, data.now)}{r.status !== 'open' ? ` · ${r.status}` : ''}{#if r.details}<br /><span class="muted">{r.details}</span>{/if}</p>
				{/each}
			</details>

			{#if data.status === 'open'}
				<form method="POST" action="?/dismiss" class="row resolve" use:enhance={keep}>
					<input type="hidden" name="type" value={g.type} />
					<input type="hidden" name="id" value={g.id} />
					<button name="status" value="actioned" class="ghost">Mark handled</button>
					<button name="status" value="dismissed" class="ghost">Dismiss</button>
				</form>
			{/if}
		</li>
	{:else}
		<li class="muted">{data.status === 'open' ? 'Nothing to review. 🎧' : 'No closed reports yet.'}</li>
	{/each}
</ul>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.tabs { display: flex; gap: 14px; margin: 10px 0 14px; }
	.tabs a { color: var(--dim); text-decoration: none; padding-bottom: 3px; border-bottom: 2px solid transparent; }
	.tabs a.on { color: var(--paper); border-color: var(--pink); }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.list > li { background: var(--ink-2); border-radius: var(--radius); padding: 14px; display: grid; gap: 10px; }
	.head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
	.kind { text-transform: uppercase; font-size: 0.6rem; border: 1px solid var(--line-2); border-radius: var(--radius); padding: 2px 7px 1px; color: var(--dim); }
	.why { color: #ff5a4e; }
	blockquote { margin: 0; background: var(--ink); border-left: 4px solid var(--pink); padding: 10px 12px; border-radius: var(--radius); }
	blockquote p { margin: 0 0 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
	blockquote footer { color: var(--dim); font-weight: 400; }
	blockquote footer a { color: var(--dim); }
	blockquote.gone { opacity: 0.55; border-left-color: var(--line-2); }
	.battle { display: flex; flex-direction: column; gap: 2px; }
	.battle .display { font-size: 1.5rem; color: var(--paper); text-decoration: none; overflow-wrap: anywhere; }
	.battle .display:hover { color: var(--pink); }
	.row { align-items: center; }
	.row button, .row .btn { min-height: 38px; padding: 0 12px; font-size: 0.95rem; }
	.row a.mono { color: var(--dim); }
	.uacts { display: grid; gap: 6px; border-top: 1px dashed var(--line-2); padding-top: 8px; }
	.uacts a { color: var(--paper); }
	.tag { border: 1px solid var(--line-2); border-radius: var(--radius); padding: 2px 6px 1px; color: var(--dim); font-size: 0.58rem; margin-left: 4px; }
	.tag.bad { border-color: #ff5a4e; color: #ff5a4e; }
	.danger { border-color: #ff5a4e; color: #ff5a4e; }
	.danger:hover { background: #ff5a4e; color: var(--ink); }
	.who summary { cursor: pointer; color: var(--dim); }
	.who p { margin: 6px 0 0; }
	.resolve { justify-content: flex-end; }
	.thread { list-style: none; margin: 0; padding: 10px 12px; background: var(--ink); border-radius: var(--radius); display: grid; gap: 6px; }
	.thread li { color: var(--dim); overflow-wrap: anywhere; }
	.thread li .mono { color: var(--paper); font-size: 0.7rem; margin-right: 6px; }
	.thread li.reported { color: var(--paper); border-left: 3px solid #ff5a4e; padding-left: 8px; }
	.warnc { color: var(--warn); }
	.ghost { color: var(--dim); }
</style>
