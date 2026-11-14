<script lang="ts">
	import { goto } from '$app/navigation';
	import ServiceCard from '#lib/components/ServiceCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const f = $derived(data.filters);
	function nav(e: Event) {
		const form = (e.currentTarget as HTMLElement).closest('form') as HTMLFormElement;
		const p = new URLSearchParams();
		for (const [k, v] of new FormData(form)) if (v && !(k === 'sort' && v === 'newest')) p.set(k, String(v));
		goto(`/services${p.size ? `?${p}` : ''}`, { reset: false });
	}
</script>

<svelte:head><title>Hire producers & engineers · AuxRiot</title></svelte:head>

<section class="hero">
	<p class="mono kicker">The store — services</p>
	<h1 class="headline">Hire people who <span>proved it.</span></h1>
	<p class="sub">Mixing, mastering, custom beats and more — with battle records, judging and respect on every card.</p>
</section>

<nav class="tabs" data-sveltekit-noscroll>
	<a href="/store">Beats</a>
	<a href="/services" class="active">Services</a>
</nav>

<form class="filters" method="GET" action="/services" onsubmit={(e) => { e.preventDefault(); nav(e); }}>
	<input name="q" type="search" placeholder="Search services or people" value={f.q} onchange={nav} />
	<select name="category" value={f.category} onchange={nav} aria-label="Category">
		<option value="">All services</option>
		{#each data.categories as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
	</select>
	<select name="sort" value={f.sort} onchange={nav} aria-label="Sort">
		<option value="newest">Newest</option>
		<option value="reputation">Most respected</option>
		<option value="price_low">Lowest price</option>
		<option value="fastest">Fastest turnaround</option>
	</select>
	<input name="max" type="text" inputmode="decimal" placeholder="Max starting $" value={f.max || ''} onchange={nav} />
</form>

{#if data.services.length}
	<ul class="grid">
		{#each data.services as s (s.id)}<li><ServiceCard service={s} meId={data.meId} /></li>{/each}
	</ul>
{:else}
	<div class="empty">
		<p class="display big">{f.category || f.q || f.max ? 'Nobody matches.' : 'Services open soon.'}</p>
		<p class="muted">Mix, master or make beats to order? <a href="/settings/services">Offer your services</a> — your battle record and judging show on your card.</p>
	</div>
{/if}

<p class="small muted offer">Do this for a living? <a href="/settings/services">List your services →</a></p>

<style>
	.hero { padding: 4px 0 12px; }
	.kicker { color: var(--muted); margin: 0 0 8px; font-size: 0.66rem; }
	.headline { font-size: clamp(2.4rem, 11vw, 5rem); line-height: 0.92; margin: 0 0 8px; }
	.headline span { color: var(--pink); }
	.sub { color: var(--dim); margin: 0; }
	.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
	.filters input[name='q'] { grid-column: 1 / -1; }
	@media (min-width: 760px) { .filters { grid-template-columns: 2fr 1fr 1fr 1fr; } .filters input[name='q'] { grid-column: auto; } }
	.grid > li { min-width: 0; }
	.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
	@media (min-width: 720px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
	@media (min-width: 1080px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.empty { padding: 30px 0; }
	.big { font-size: 2.2rem; margin: 0 0 8px; }
	.offer { margin-top: 20px; }
</style>
