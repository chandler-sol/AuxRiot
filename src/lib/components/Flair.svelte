<script lang="ts">
	import { flairFor } from '#lib/flair.ts';
	let { respect, size = 'sm' }: { respect: number | null | undefined; size?: 'sm' | 'lg' } = $props();
	const f = $derived(flairFor(respect));
</script>

{#if f}
	<span class="flair t{f.tier} {size}" title="{f.label} · {respect} respect from upvoted comments">
		{#if f.tier === 3}★★★{:else if f.tier === 2}★★{:else}★{/if}
		{f.label}
	</span>
{/if}

<style>
	.flair {
		display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
		font-family: var(--mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
		font-size: 0.56rem; line-height: 1; padding: 4px 6px 3px; border-radius: 2px;
		transform: rotate(-2deg);
	}
	.flair.lg { font-size: 0.72rem; padding: 6px 9px 5px; }
	/* Sharp ear: outlined stamp. Trusted ear: paper ticket. Tastemaker: hot pink. */
	.t1 { border: 1.5px solid var(--paper); color: var(--paper); }
	.t2 { background: var(--paper); color: var(--ink); }
	.t3 { background: var(--pink); color: var(--ink); box-shadow: 2px 2px 0 var(--paper); }
</style>
