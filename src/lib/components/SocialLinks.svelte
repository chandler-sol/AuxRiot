<script lang="ts">
	import { SOCIALS } from '#lib/socials.ts';
	let { socials, username }: { socials: Record<string, string>; username: string } = $props();
	let filled = $derived(SOCIALS.filter((s) => socials[s.key]));
</script>

{#if filled.length}
	<ul class="socials" aria-label="{username}'s links">
		{#each filled as s (s.key)}
			<li>
				<a href={socials[s.key]} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label="{username} on {s.label}" title={s.label}>
					<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={s.path} /></svg>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.socials { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; }
	a {
		display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px;
		border: 1.5px solid var(--line-2); border-radius: var(--radius); color: var(--dim);
		transition: color 0.15s, border-color 0.15s, background 0.15s;
	}
	a:hover, a:focus-visible { color: var(--ink); background: var(--pink); border-color: var(--pink); }
	svg { fill: currentColor; }
</style>
