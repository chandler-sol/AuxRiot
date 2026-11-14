<script lang="ts">
	/** Verified creator badge: a seal check plus what they're verified as. */
	let { label, size = 'sm', compact = false }: { label: string | null | undefined; size?: 'sm' | 'lg'; compact?: boolean } = $props();
</script>

{#if label}
	<span class="vbadge {size}" title="Verified {label.toLowerCase()} on AuxRiot">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z" fill="var(--cyan, #2bd9f5)" />
			<path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="#0e0d0c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
		{#if !compact}<span class="vl">{label}</span>{:else}<span class="sr">Verified {label}</span>{/if}
	</span>
{/if}

<style>
	.vbadge {
		display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; vertical-align: middle;
		font-family: var(--mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
		font-size: 0.56rem; line-height: 1; color: var(--cyan, #2bd9f5);
	}
	.vbadge svg { width: 15px; height: 15px; flex: none; }
	.vbadge.lg { font-size: 0.74rem; gap: 6px; }
	.vbadge.lg svg { width: 22px; height: 22px; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
