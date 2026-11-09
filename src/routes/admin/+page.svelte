<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });

	function targetLink(type: string, id: string) {
		if (type === 'battle') return `/battles/${id}`;
		if (type === 'user') return `/u/${id}`;
		return null;
	}
</script>

<svelte:head><title>Admin · BeatBattle</title></svelte:head>

<h1>Moderation</h1>
{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

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
	.item { border-top: 1px solid var(--border); padding-top: 10px; }
	.item button { min-height: 34px; padding: 0 12px; font-size: 0.85rem; }
</style>
