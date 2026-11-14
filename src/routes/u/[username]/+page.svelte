<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import BattleCard from '#lib/components/BattleCard.svelte';
	import StoreCard from '#lib/components/StoreCard.svelte';
	import ServiceCard from '#lib/components/ServiceCard.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import { nextFlair } from '#lib/flair.ts';
	import SocialLinks from '#lib/components/SocialLinks.svelte';
	import { hexFor } from '#lib/colors.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let p = $derived(data.profile);
	let decided = $derived(p.wins + p.losses);
	let accent = $derived(hexFor(p.color));
	let now = $state(Date.now());
	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
	let winRate = $derived(decided ? Math.round((p.wins / decided) * 100) : null);
</script>

<svelte:head><title>{p.username} · AuxRiot</title></svelte:head>

<div class="pgrid">
<section class="head" style:--me={accent}>
	<div class="id">
		<Avatar username={p.username} avatarKey={p.avatar_key} color={p.color} size={88} />
		<div class="idtext">
			<p class="mono muted">Producer — joined {new Date(p.created_at).toLocaleDateString()}</p>
			{#if data.isMe}<a class="mono edit" href="/settings/profile">Edit profile</a>{/if}
		</div>
	</div>
	<h1 class="name">{p.username}</h1>
	{#if p.respect > 0 || data.isMe}
		{@const nx = nextFlair(p.respect)}
		<p class="respect mono">
			<Flair respect={p.respect} size="lg" />
			<span>{p.respect.toLocaleString()} respect</span>
			{#if data.isMe && nx}<span class="muted">· {nx.need} to {nx.label}</span>{/if}
		</p>
	{/if}
	{#if p.bio}<p class="bio">{p.bio}</p>{/if}
	{#if Object.values(p.socials ?? {}).some(Boolean)}
		<div class="soc"><p class="mono hit">Hit me up</p><SocialLinks socials={p.socials} username={p.username} /></div>
	{/if}
	<div class="ticket">
		<div><span class="display v">{p.wins}</span><span class="mono l">Wins</span></div>
		<div><span class="display v">{p.losses}</span><span class="mono l">Losses</span></div>
		<div><span class="display v">{p.ties}</span><span class="mono l">Ties</span></div>
		<div><span class="display v">{winRate === null ? '—' : winRate + '%'}</span><span class="mono l">Win rate</span></div>
		<div><span class="display v">{data.judged}</span><span class="mono l">Judged</span></div>
	</div>
</section>

{#if data.services.length}
	<section class="storefront" id="services">
		<div class="sf-head">
			<h2>Hire {p.username}</h2>
			<a class="mono small" href="/services">All services →</a>
		</div>
		<ul class="sf-grid">
			{#each data.services as svc (svc.id)}<li><ServiceCard service={svc} meId={data.meId} showProvider={false} /></li>{/each}
		</ul>
	</section>
{:else if data.isMe}
	<p class="muted small sf-empty" id="services">Mix, master or make beats to order? <a href="/settings/services">Offer your services</a>.</p>
{/if}

{#if data.store.length}
	{@const forSale = data.store.filter((i) => i.status === 'listed').length}
	<section class="storefront" id="store">
		<div class="sf-head">
			<h2>Beats for sale{forSale ? ` · ${forSale}` : ''}</h2>
			<a class="mono small" href="/store">Whole store →</a>
		</div>
		<ul class="sf-grid">
			{#each data.store as item (item.id)}<li><StoreCard {item} showSeller={false} /></li>{/each}
		</ul>
	</section>
{:else if data.isMe}
	<p class="muted small sf-empty" id="store">Want to sell a beat? Open one of your battles and hit <strong>Sell this beat</strong>.</p>
{/if}

<div class="battles">
<h2>Battles</h2>
{#if data.battles.length === 0}
	<p class="muted">No battles yet.</p>
{:else}
	<ul class="list">
		{#each data.battles as b (b.id)}
			<li><BattleCard battle={b} {now} /></li>
		{/each}
	</ul>
{/if}
</div>
</div>

<style>
	.storefront { margin: 26px 0 8px; }
	.sf-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
	.sf-head a { color: var(--dim); }
	.sf-grid > li { min-width: 0; }
	.sf-grid { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 12px; }
	@media (min-width: 720px) { .sf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
	.sf-empty { margin-top: 22px; }
	.respect { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 6px 0 10px; font-weight: 400; color: var(--dim); }
	.head { padding: 8px 0 24px; }
	.id { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
	.idtext { display: flex; flex-direction: column; gap: 6px; }
	.idtext p { margin: 0; }
	.edit { color: var(--me); text-decoration: none; }
	.edit:hover { color: var(--paper); }
	.bio { color: var(--dim); margin: 0 0 14px; white-space: pre-line; overflow-wrap: anywhere; }
	.soc { margin-bottom: 16px; }
	.hit { margin: 0 0 6px; color: var(--pink); font-size: 0.66rem; }
	.name { font-size: clamp(3rem, 16vw, 5.5rem); line-height: 0.9; color: var(--me); overflow-wrap: anywhere; }
	.ticket {
		display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
		background: var(--paper); color: var(--ink); border-radius: var(--radius); padding: 12px 8px 10px; text-align: center;
	}
	.ticket div { display: flex; flex-direction: column; }
	.v { font-size: 2rem; line-height: 1; }
	@media (max-width: 480px) { .v { font-size: 1.6rem; } .l { font-size: 0.52rem; } }
	.l { color: #5a544b; font-size: 0.6rem; margin-top: 4px; }
	.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }

	@media (min-width: 960px) {
		.pgrid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 40px; align-items: start; padding-top: 16px; }
		.head { position: sticky; top: 84px; padding: 0; }
		.name { font-size: clamp(2.6rem, 4.4vw, 4rem); }
		.battles h2 { margin-top: 0; }
		.list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
	}
</style>
