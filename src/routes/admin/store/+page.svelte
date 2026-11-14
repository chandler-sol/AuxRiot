<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { ago } from '#lib/format.ts';
	import { formatSize, money, money2, splitSale } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	let removing = $state<string | null>(null);
	const sample = $derived(splitSale(5000, data.settings.feePct));
	// Flag prices far from the norm so odd listings get a look.
	const flag = (c: number | null) => {
		if (!c || !data.medianCents) return '';
		if (c >= data.medianCents * 10) return 'Way above typical';
		if (c < 500) return 'Very low';
		return '';
	};
	const TABS = ['listed', 'draft', 'unlisted', 'sold', 'removed'];
	let removingSvc = $state<string | null>(null);
</script>

<svelte:head><title>Store · AuxRiot admin</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">{data.isAdmin ? 'Admin' : 'Mod tools'}</a> — Store</p>
<h1 class="headline">Store <span>desk.</span></h1>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

<section class="card stack">
	<h2>Fee &amp; pricing</h2>
	<p class="small muted">
		On a $50 sale: AuxRiot keeps {money2(sample.feeCents)}, card processing is {money2(sample.processingCents)} (from the producer's share), producer gets
		{money2(sample.netCents)}. Typical listed price: {data.medianCents ? money(data.medianCents) : '—'}.
	</p>
	{#if data.isAdmin}
		<form method="POST" action="?/settings" class="row" use:enhance={keep}>
			<label for="fee" style="margin:0">Fee</label>
			<input id="fee" name="fee" inputmode="decimal" value={data.settings.feePct} style="width:80px" /> <span class="small muted">%</span>
			<label for="min" style="margin:0 0 0 10px">Suggested min</label>
			<input id="min" name="min" inputmode="decimal" value={data.settings.minPriceCents / 100} style="width:90px" /> <span class="small muted">$</span>
			<button>Save</button>
		</form>
		<p class="small muted">The minimum is advice shown to producers, not a hard block.</p>
	{:else}
		<p class="small">Fee {data.settings.feePct}% · suggested minimum {money(data.settings.minPriceCents)} (admins can change these).</p>
	{/if}
</section>

<nav class="tabs" data-sveltekit-noscroll>
	{#each TABS as t (t)}
		<a href="/admin/store?status={t}" class:active={data.status === t}>{t} · {data.counts[t] ?? 0}</a>
	{/each}
</nav>

<p class="mono small svc-tab"><a href="/admin/store?status=services" class:on={data.status === 'services'}>Services →</a></p>

{#if data.status === 'services'}
	<ul class="list">
		{#each data.services as sv (sv.id)}
			<li>
				<div class="top"><span class="display t">{sv.title}</span><span class="display p">from {money(sv.price_from_cents)}</span></div>
				<p class="mono meta">@{sv.username} · {sv.category} · {sv.status} · {sv.samples} sample{sv.samples === 1 ? '' : 's'} · updated {ago(sv.updated_at, data.now)}</p>
				{#if sv.status !== 'removed'}
					{#if removingSvc === sv.id}
						<form method="POST" action="?/removeService" class="row" use:enhance={keep}>
							<input type="hidden" name="id" value={sv.id} />
							<input name="note" required placeholder="Reason (mod log)" style="flex:1;min-width:160px" />
							<button class="sm danger">Remove service</button>
						</form>
					{:else}
						<button class="sm ghost" onclick={() => (removingSvc = sv.id)}>Remove…</button>
					{/if}
				{/if}
			</li>
		{:else}
			<li class="muted">No services yet.</li>
		{/each}
	</ul>
{:else}
<ul class="list">
	{#each data.listings as l (l.id)}
		{@const warn = flag(l.price_cents)}
		<li>
			<div class="top">
				<a class="display t" href="/battles/{l.battle_id}">{l.title}</a>
				<span class="display p">{money(l.price_cents) || '—'}</span>
			</div>
			<p class="mono meta">
				@{l.username} · {l.wins}-{l.losses} · joined {ago(l.joined, data.now)} · updated {ago(l.updated_at, data.now)}
				{#if l.stems_price_cents} · stems {money(l.stems_price_cents)}{/if}
				{#if l.file_size} · file {formatSize(l.file_size)}{/if}
				{#if l.stems_size} · stems {formatSize(l.stems_size)}{/if}
			</p>
			{#if warn}<span class="flag mono">{warn}</span>{/if}
			{#if l.status === 'removed'}
				<form method="POST" action="?/restore" use:enhance={keep}><input type="hidden" name="id" value={l.id} /><button class="sm">Restore</button></form>
			{:else if l.status !== 'sold'}
				{#if removing === l.id}
					<form method="POST" action="?/remove" class="row" use:enhance={keep}>
						<input type="hidden" name="id" value={l.id} />
						<input name="note" required placeholder="Reason (mod log)" style="flex:1;min-width:160px" />
						<button class="sm danger">Remove listing</button>
					</form>
				{:else}
					<button class="sm ghost" onclick={() => (removing = l.id)}>Remove…</button>
				{/if}
			{/if}
		</li>
	{:else}
		<li class="muted">Nothing here.</li>
	{/each}
</ul>
{/if}

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; margin-bottom: 14px; }
	.headline span { color: var(--pink); }
	section { margin-bottom: 16px; }
	.tabs a { text-transform: capitalize; }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
	.list li { background: var(--ink-2); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 6px; }
	.top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
	.t { font-size: 1.3rem; color: var(--paper); text-decoration: none; overflow-wrap: anywhere; }
	.p { font-size: 1.5rem; color: var(--pink); white-space: nowrap; }
	.meta { margin: 0; color: var(--dim); font-weight: 400; font-size: 0.64rem; }
	.flag { justify-self: start; border: 1px solid var(--warn); color: var(--warn); border-radius: var(--radius); padding: 2px 8px 1px; font-size: 0.6rem; }
	.sm { min-height: 34px; padding: 0 12px; font-size: 0.85rem; justify-self: start; }
	.ghost { color: var(--dim); }
	.svc-tab { margin: -6px 0 12px; }
	.svc-tab a { color: var(--dim); }
	.svc-tab a.on { color: var(--pink); }
	.danger { border-color: #ff5a4e; color: #ff5a4e; }
</style>
