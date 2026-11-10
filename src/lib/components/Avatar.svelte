<script lang="ts">
	let { username, avatarKey = null, size = 40 }: { username: string; avatarKey?: string | null; size?: number } = $props();
</script>

{#if avatarKey}
	<img class="av" src="/{avatarKey}" alt="" width={size} height={size} loading="lazy" decoding="async" style:width="{size}px" style:height="{size}px" />
{:else}
	<span class="av fallback display" aria-hidden="true" style:width="{size}px" style:height="{size}px" style:font-size="{size * 0.55}px">
		{username.slice(0, 1)}
	</span>
{/if}

<style>
	.av { display: inline-block; flex: none; border-radius: var(--radius); object-fit: cover; background: var(--ink-3); }
	.fallback { display: inline-flex; align-items: center; justify-content: center; background: var(--pink); color: var(--ink); line-height: 1; padding-top: 0.06em; }
</style>
