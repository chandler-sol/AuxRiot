<script lang="ts">
	import { enhance } from '$app/forms';
	import ServiceCard from '#lib/components/ServiceCard.svelte';
	import { SERVICE_CATEGORIES } from '#lib/services.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let category = $state<string>('mixing');
</script>

<svelte:head><title>Your services · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/settings/profile">Settings</a> — Services</p>
<h1 class="headline">Your <span>services.</span></h1>
{#if data.welcome}
	<p class="welcome">Welcome! Add what you offer — mixing, mastering, custom beats — with a couple of samples so people can hear your work. Then build your reputation by judging battles: it shows on every service card.</p>
{:else}
	<p class="sub">Get hired for mixing, mastering, custom beats and more. Buyers send a quote request; your battle record, judging and respect show on every card.</p>
{/if}
<p class="small muted">Payment for services opens soon on AuxRiot. Until then, agree on details in messages — but don't take payment off-site; it isn't allowed and isn't protected.</p>

{#if form?.error}<p class="error">{form.error}</p>{/if}

{#if data.services.length}
	<ul class="list">
		{#each data.services as s (s.id)}
			<li>
				<span class="mono status" class:live={s.status === 'active'}>{s.status === 'active' ? 'Live' : 'Paused — not visible'}</span>
				<ServiceCard service={s} meId={data.meId} showProvider={false} />
			</li>
		{/each}
	</ul>
{/if}

{#if data.services.length < data.max}
	<form method="POST" action="?/create" class="card stack new" use:enhance>
		<h2>Add a service</h2>
		<div class="cats">
			{#each SERVICE_CATEGORIES as c (c.key)}
				<label class="cat">
					<input type="radio" name="category" value={c.key} bind:group={category} />
					<span><strong>{c.label}</strong><small>{c.hint}</small></span>
				</label>
			{/each}
		</div>
		<button class="primary">Set it up →</button>
	</form>
{/if}

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.sub { color: var(--dim); margin: 10px 0 6px; }
	.welcome { background: var(--ink-2); border-left: 4px solid var(--pink); padding: 12px 14px; border-radius: var(--radius); margin: 12px 0 8px; }
	.list > li { min-width: 0; }
	.list { list-style: none; margin: 16px 0; padding: 0; display: grid; gap: 14px; }
	@media (min-width: 720px) { .list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
	.status { display: block; font-size: 0.62rem; color: var(--dim); margin-bottom: 6px; }
	.status.live { color: var(--pink); }
	.new { margin-top: 16px; }
	.cats { display: grid; gap: 8px; }
	.cat { display: flex; margin: 0; cursor: pointer; text-transform: none; letter-spacing: 0; font-family: var(--body); }
	.cat input { position: absolute; opacity: 0; pointer-events: none; }
	.cat span { flex: 1; display: flex; flex-direction: column; gap: 2px; border: 1.5px solid var(--line-2); border-radius: var(--radius); padding: 12px 14px; color: var(--paper); }
	.cat small { color: var(--dim); font-size: 0.85rem; }
	.cat input:checked + span { border-color: var(--pink); background: var(--ink); }
	.cat input:focus-visible + span { outline: 2px solid var(--pink); }
</style>
