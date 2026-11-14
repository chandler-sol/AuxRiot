<script lang="ts">
	/** "Reps @creator": the verified creator this person joined AuxRiot with (or chose to rep). */
	let { crew }: { crew: string | null | undefined } = $props();
</script>

{#if crew}
	<a class="crew mono" href="/u/{crew}" title="Part of @{crew}'s crew">⚑ {crew} crew</a>
{/if}

<style>
	.crew {
		display: inline-flex; align-items: center; white-space: nowrap; text-decoration: none;
		font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.54rem; line-height: 1;
		padding: 4px 6px 3px; border-radius: 2px; border: 1.5px dashed var(--cyan, #2bd9f5); color: var(--cyan, #2bd9f5);
	}
	.crew:hover { background: var(--cyan, #2bd9f5); color: var(--ink); }
</style>
