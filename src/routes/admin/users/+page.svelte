<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Avatar from '#lib/components/Avatar.svelte';
	import { ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let openGrant = $state<string | null>(null);
	let openSuspend = $state<string | null>(null);
	let openMenu = $state<string | null>(null);
	// Keep the current search/filter/sort on form actions (a bare "?/grant" would drop them).
	const act = (name: string) => {
		const qs = new URLSearchParams();
		if (data.q) qs.set('q', data.q);
		if (data.filter !== 'all') qs.set('filter', data.filter);
		if (data.sort !== 'newest') qs.set('sort', data.sort);
		const base = qs.toString();
		return `?${base ? base + '&' : ''}/${name}`;
	};
	const keepClose = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
		openMenu = null;
		await update({ reset: false });
	};
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });

	function nav(e: Event) {
		const f = (e.currentTarget as HTMLElement).closest('form') as HTMLFormElement;
		const p = new URLSearchParams(new FormData(f) as unknown as Record<string, string>);
		goto(`/admin/users?${p}`, { reset: false });
	}
</script>

<svelte:window
	onclick={(e) => { if (openMenu && !(e.target as HTMLElement).closest('.more')) openMenu = null; }}
	onkeydown={(e) => { if (e.key === 'Escape') openMenu = null; }}
/>

<svelte:head><title>Users · AuxRiot admin</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">{data.isAdmin ? 'Admin' : 'Mod tools'}</a> — Users</p>
<h1 class="headline">{data.total.toLocaleString()} <span>registered.</span></h1>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.winners}<p class="small">Winners: <strong>{form.winners.join(', ')}</strong></p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

{#if data.isAdmin}
<details class="drop">
	<summary class="display">Random credit drop</summary>
	<form method="POST" action={act('drop')} class="stack" use:enhance={keep}>
		<p class="muted small">Picks members at random and gives each of them credits. Only members with a confirmed email who aren't shadowbanned can win.</p>
		<div class="two">
			<div><label for="dc">How many winners</label><input id="dc" name="count" type="number" min="1" max="100" value="3" required /></div>
			<div><label for="da">Credits each</label><input id="da" name="amount" type="number" min="1" max="10000" value="250" required /></div>
		</div>
		<div>
			<label for="dp">Pick from</label>
			<select id="dp" name="pool">
				<option value="confirmed">All confirmed members</option>
				<option value="active">Active in the last 30 days</option>
				<option value="battlers">Members who have battled</option>
			</select>
		</div>
		<input name="note" type="text" maxlength="200" placeholder="Note in their history — e.g. Friday drop" />
		<label class="check"><input type="checkbox" name="exclude_me" checked /> Leave me out</label>
		<button class="primary">Drop credits</button>
	</form>
</details>
{/if}

<form class="filters" method="GET" action="/admin/users">
	<input name="q" type="search" placeholder={data.isAdmin ? 'Search username or email' : 'Search username'} value={data.q} onchange={nav} />
	<select name="filter" value={data.filter} onchange={nav} aria-label="Filter">
		<option value="all">Everyone</option>
		<option value="confirmed">Confirmed email</option>
		<option value="unconfirmed">Unconfirmed</option>
		<option value="news">News opt-ins</option>
		<option value="shadowbanned">Shadowbanned</option>
		<option value="suspended">Suspended</option>
		<option value="staff">Mods &amp; admins</option>
	</select>
	<select name="sort" value={data.sort} onchange={nav} aria-label="Sort">
		<option value="newest">Newest</option>
		<option value="oldest">Oldest</option>
		<option value="active">Recently active</option>
		<option value="credits">Most credits</option>
		<option value="wins">Most wins</option>
		<option value="battles">Most battles</option>
	</select>
	<noscript><button>Go</button></noscript>
</form>

<p class="mono muted count">{data.users.length} shown{data.users.length === 200 ? ' (first 200)' : ''}</p>

<ul class="list">
	{#each data.users as u (u.id)}
		{@const canAct = u.id !== data.meId && (data.isAdmin || (!u.is_admin && !u.is_mod))}
		<li class="user">
			<div class="top">
				<Avatar username={u.username} avatarKey={u.avatar_key} color={u.color} size={44} />
				<div class="who">
					<a class="display name" href="/u/{u.username}">{u.username}</a>
					{#if u.email}<span class="small muted email">{u.email}</span>{/if}
				</div>
				<span class="display credits">{u.credits.toLocaleString()}<span class="mono"> cr</span></span>
				{#if canAct || data.isAdmin}
					<details class="more" open={openMenu === u.id} ontoggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o) openMenu = u.id; else if (openMenu === u.id) openMenu = null; }}>
						<summary aria-label="Actions for {u.username}">
							<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="19" cy="12" r="2" fill="currentColor" /></svg>
						</summary>
						<div class="pop">
							{#if data.isAdmin}
								<button type="button" onclick={() => { openGrant = u.id; openSuspend = null; openMenu = null; }}>Give credits</button>
							{/if}
							{#if canAct}
								<form method="POST" action={act('shadowban')} use:enhance={keepClose}>
									<input type="hidden" name="user_id" value={u.id} />
									<input type="hidden" name="on" value={u.shadowbanned ? '0' : '1'} />
									<button>{u.shadowbanned ? 'Lift shadowban' : 'Shadowban'}</button>
								</form>
								{#if u.suspended_at}
									<form method="POST" action={act('suspend')} use:enhance={keepClose}>
										<input type="hidden" name="user_id" value={u.id} />
										<input type="hidden" name="on" value="0" />
										<button>Lift suspension</button>
									</form>
								{:else}
									<button type="button" class="bad" onclick={() => { openSuspend = u.id; openGrant = null; openMenu = null; }}>Suspend…</button>
								{/if}
							{/if}
							{#if data.isAdmin && !u.is_admin}
								<form method="POST" action={act('role')} use:enhance={keepClose}>
									<input type="hidden" name="user_id" value={u.id} />
									<input type="hidden" name="on" value={u.is_mod ? '0' : '1'} />
									<button>{u.is_mod ? 'Remove moderator' : 'Make moderator'}</button>
								</form>
							{/if}
							<a href="/u/{u.username}">View profile</a>
						</div>
					</details>
				{/if}
			</div>
			<div class="tags mono">
				{#if u.is_admin}<span class="tag pink">Admin</span>{:else if u.is_mod}<span class="tag pink">Moderator</span>{/if}
				{#if u.suspended_at}<span class="tag bad">Suspended {ago(u.suspended_at, data.now)}{u.suspended_reason ? ` — ${u.suspended_reason}` : ''}</span>{/if}
				{#if !u.email_verified_at}<span class="tag warn">Unconfirmed</span>{/if}
				{#if u.shadowbanned}<span class="tag bad">Shadowbanned</span>{/if}
				{#if u.news_opt_in}<span class="tag">News</span>{/if}
				{#if u.linked}<span class="tag bad">{u.linked} linked device account{u.linked === 1 ? '' : 's'}</span>{/if}
			</div>
			<div class="stats mono">
				<span>{u.wins}-{u.losses}{u.ties ? `-${u.ties}` : ''} W-L</span>
				<span>{u.battles} battle{u.battles === 1 ? '' : 's'}</span>
				<span>{u.votes} vote{u.votes === 1 ? '' : 's'}</span>
				<span>Joined {ago(u.created_at, data.now)}</span>
				{#if u.last_seen}<span>Seen {ago(u.last_seen, data.now)}</span>{/if}
			</div>
			{#if openSuspend === u.id}
				<form
					method="POST"
					action={act('suspend')}
					class="grant"
					use:enhance={() =>
						async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') openSuspend = null;
						}}
				>
					<input type="hidden" name="user_id" value={u.id} />
					<input type="hidden" name="on" value="1" />
					<p class="small muted">Logs them out everywhere and blocks logging back in. They'll see this reason on the login page.</p>
					<input name="reason" type="text" maxlength="300" required placeholder="Reason — e.g. Vote rigging with alt accounts" />
					<div class="row"><button class="small-btn danger">Suspend {u.username}</button><button type="button" class="small-btn ghost" onclick={() => (openSuspend = null)}>Cancel</button></div>
				</form>
			{/if}
			{#if openGrant === u.id}
				<form
					method="POST"
					action={act('grant')}
					class="grant"
					use:enhance={() =>
						async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') openGrant = null;
						}}
				>
					<input type="hidden" name="user_id" value={u.id} />
					<div class="quick">
						{#each [100, 250, 500, 1000] as amt (amt)}
							<button name="amount" value={amt} class="small-btn">+{amt}</button>
						{/each}
					</div>
					<div class="row">
						<input name="amount" type="number" placeholder="Custom (−500 takes back)" style="flex:1;min-width:140px" />
						<button class="small-btn primary">Apply</button>
						<button type="button" class="small-btn ghost" onclick={() => (openGrant = null)}>Cancel</button>
					</div>
					<input name="note" type="text" maxlength="200" placeholder="Note in their history (optional)" />
				</form>
			{/if}
		</li>
	{:else}
		<li class="muted">Nobody matches.</li>
	{/each}
</ul>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.drop { background: var(--ink-2); border: 1.5px dashed var(--line-2); border-radius: var(--radius); padding: 12px 16px; margin: 12px 0 18px; }
	.drop summary { cursor: pointer; font-size: 1.4rem; list-style: none; }
	.drop summary::-webkit-details-marker { display: none; }
	.drop summary::after { content: ' +'; color: var(--pink); }
	.drop[open] summary::after { content: ' −'; }
	.drop form { margin-top: 12px; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.check { display: flex; gap: 10px; align-items: center; font-family: var(--body); font-size: 0.95rem; text-transform: none; letter-spacing: 0; color: var(--paper); cursor: pointer; }
	.check input { width: 20px; height: 20px; accent-color: var(--pink); }
	.filters { display: grid; grid-template-columns: 1fr; gap: 8px; }
	@media (min-width: 640px) { .filters { grid-template-columns: 1fr auto auto; } }
	.count { margin: 12px 0 8px; font-weight: 400; }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.user { background: var(--ink-2); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
	.top { display: flex; align-items: center; gap: 12px; }
	.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.name { font-size: 1.5rem; color: var(--paper); text-decoration: none; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.name:hover { color: var(--pink); }
	.email { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.credits { font-size: 1.5rem; color: var(--pink); white-space: nowrap; }
	.credits .mono { font-size: 0.65rem; color: var(--dim); }
	.tags { display: flex; flex-wrap: wrap; gap: 6px; }
	.tag { border: 1px solid var(--line-2); border-radius: var(--radius); padding: 3px 8px 2px; color: var(--dim); font-size: 0.62rem; }
	.tag.pink { border-color: var(--pink); color: var(--pink); }
	.tag.warn { border-color: var(--warn); color: var(--warn); }
	.tag.bad { border-color: #ff5a4e; color: #ff5a4e; }
	.stats { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--dim); font-weight: 400; }
	.more { position: relative; flex: none; }
	.more summary {
		list-style: none; cursor: pointer; width: 40px; height: 40px; display: grid; place-items: center;
		border: 1.5px solid var(--line-2); border-radius: var(--radius); color: var(--dim);
	}
	.more summary::-webkit-details-marker { display: none; }
	.more summary:hover, .more[open] summary { border-color: var(--paper); color: var(--paper); }
	.pop {
		position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 220px; padding: 6px 0;
		background: var(--ink-3, #222); border: 1.5px solid var(--line-2); border-radius: var(--radius);
		box-shadow: 0 14px 30px rgba(0, 0, 0, 0.55); display: flex; flex-direction: column;
	}
	.pop button, .pop a {
		display: flex; align-items: center; width: 100%; min-height: 46px; padding: 0 16px; text-align: left;
		background: none; border: 0; border-radius: 0; color: var(--paper); text-decoration: none;
		font-family: var(--display); font-size: 1.15rem; letter-spacing: 0.04em; text-transform: uppercase; justify-content: flex-start;
	}
	.pop button:hover, .pop a:hover { background: var(--ink-2); color: var(--pink); }
	.pop .bad { color: #ff5a4e; }
	.pop a { color: var(--dim); border-top: 1.5px dashed var(--line-2); margin-top: 4px; }
	.small-btn { min-height: 40px; padding: 2px 14px 0; font-size: 1rem; }
	.ghost { color: var(--dim); }
	.danger { border-color: #ff5a4e; color: #ff5a4e; }
	.danger:hover { background: #ff5a4e; color: var(--ink); }
	.grant { display: grid; gap: 8px; border-top: 1.5px dashed var(--line-2); padding-top: 10px; }
	.quick { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
