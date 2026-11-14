<script lang="ts">
	import Player from '#lib/components/Player.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import { money } from '#lib/store.ts';
	import { categoryOf } from '#lib/services.ts';
	import type { ServiceCard } from '#lib/server/services.ts';

	let { service, meId = null, showProvider = true }: { service: ServiceCard; meId?: string | null; showProvider?: boolean } = $props();
	const cat = $derived(categoryOf(service.category));
	const p = $derived(service.provider);
	const record = $derived(p.wins + p.losses + p.ties > 0 ? `${p.wins}-${p.losses}${p.ties ? `-${p.ties}` : ''}` : null);
	let sampleIdx = $state(0);
	let side = $state<'after' | 'before'>('after');
	const sample = $derived(service.samples[sampleIdx] ?? null);
	const mine = $derived(meId === p.id);
</script>

<article class="svc" style:--c={p.color ?? 'var(--pink)'}>
	{#if showProvider}
		<div class="who">
			<a class="name" href="/u/{p.username}#services">
				<Avatar username={p.username} avatarKey={p.avatarKey} color={p.color} size={40} />
				<span class="display">{p.username}</span>
			</a>
			<Flair respect={p.respect} />
		</div>
		<p class="rep mono">
			{#if record}<span>{record} in battles</span>{/if}
			{#if p.judged}<span>Judged {p.judged}</span>{/if}
			{#if p.respect}<span>{p.respect} respect</span>{/if}
			{#if !record && !p.judged && !p.respect}<span>New on AuxRiot</span>{/if}
		</p>
	{/if}

	<p class="cat mono">{cat?.label ?? service.category}</p>
	<h3 class="display title">{service.title}</h3>
	{#if service.description}<p class="desc">{service.description}</p>{/if}

	{#if sample}
		<div class="sample">
			<div class="srow">
				<span class="mono small stitle">{sample.title}</span>
				{#if sample.before}
					<div class="ab mono" role="group" aria-label="Compare">
						<button class:on={side === 'before'} onclick={() => (side = 'before')}>Before</button>
						<button class:on={side === 'after'} onclick={() => (side = 'after')}>After</button>
					</div>
				{/if}
			</div>
			{#key `${sample.id}-${side}`}
				{@const a = side === 'before' && sample.before ? sample.before : sample.after}
				<Player variant="compact" src={a.src} peaks={a.peaks} durationMs={a.durationMs} name={side === 'before' && sample.before ? 'Before' : 'Sample'} accent={p.color ?? '#ff3d7f'} />
			{/key}
			{#if service.samples.length > 1}
				<div class="dots">
					{#each service.samples as s, i (s.id)}
						<button class:on={i === sampleIdx} onclick={() => { sampleIdx = i; side = 'after'; }} aria-label="Sample {i + 1}: {s.title}"></button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="foot">
		<div class="terms">
			<span class="price display">From {money(service.priceFromCents)}</span>
			<span class="mono small muted">{service.turnaroundDays}-day turnaround · {service.revisions} revision{service.revisions === 1 ? '' : 's'}</span>
		</div>
		{#if mine}
			<a class="btn" href="/settings/services/{service.id}">Edit</a>
		{:else}
			<a class="btn primary" href="/messages/new?service={service.id}">Request a quote</a>
		{/if}
	</div>
</article>

<style>
	.svc { min-width: 0; grid-template-columns: minmax(0, 1fr); background: var(--ink-2); border-radius: var(--radius); border-top: 5px solid var(--c); padding: 14px; display: grid; gap: 8px; }
	.who { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.name { display: inline-flex; align-items: center; gap: 10px; color: var(--paper); text-decoration: none; min-width: 0; }
	.name .display { font-size: 1.35rem; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.name:hover .display { color: var(--c); }
	.rep { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; color: var(--dim); font-weight: 400; font-size: 0.62rem; }
	.cat { margin: 4px 0 0; color: var(--c); font-size: 0.66rem; }
	.title { font-size: 1.6rem; line-height: 1; margin: 0; overflow-wrap: anywhere; }
	.desc { margin: 0; color: var(--dim); font-size: 0.95rem; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
	.sample { display: grid; gap: 6px; }
	.srow { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; }
	.stitle { flex: 1; min-width: 0; font-size: 0.62rem; color: var(--dim); font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.sample { min-width: 0; grid-template-columns: minmax(0, 1fr); }
	.sample > :global(*) { min-width: 0; max-width: 100%; }
	.ab { display: inline-flex; border: 1.5px solid var(--line-2); border-radius: 999px; overflow: hidden; flex: none; }
	.ab button { min-height: 30px; padding: 0 12px; border: 0; border-radius: 0; font-size: 0.66rem; background: none; color: var(--dim); }
	.ab button.on { background: var(--paper); color: var(--ink); }
	.dots { display: flex; gap: 6px; justify-content: center; }
	.dots button { width: 9px; height: 9px; min-height: 0; padding: 0; border-radius: 50%; border: 1.5px solid var(--line-2); background: none; }
	.dots button.on { background: var(--paper); border-color: var(--paper); }
	.foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; border-top: 1.5px dashed var(--line-2); padding-top: 10px; }
	.terms { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.price { font-size: 1.6rem; line-height: 1; }
	.btn { min-height: 42px; padding: 2px 14px 0; font-size: 1rem; white-space: nowrap; }
</style>
