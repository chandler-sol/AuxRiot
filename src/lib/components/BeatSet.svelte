<script lang="ts">
	import Uploader from './Uploader.svelte';
	import type { PreparedAudio } from '#lib/audio-prep.ts';

	/**
	 * One uploader per round, in battle order. Reordering moves the whole slot
	 * (file, preview and all), so what you hear is what plays in that round.
	 */
	let { rounds, slots = $bindable([]) }: { rounds: number; slots: { id: number; prepared: PreparedAudio | null }[] } = $props();

	let nextId = 0;
	$effect.pre(() => {
		// Grow or shrink to the chosen format, keeping files already added.
		if (slots.length < rounds) slots = [...slots, ...Array.from({ length: rounds - slots.length }, () => ({ id: nextId++ + slots.length * 1000, prepared: null }))];
		else if (slots.length > rounds) slots = slots.slice(0, rounds);
	});

	function move(i: number, d: -1 | 1) {
		const j = i + d;
		if (j < 0 || j >= slots.length) return;
		const next = [...slots];
		[next[i], next[j]] = [next[j], next[i]];
		slots = next;
	}
</script>

<ol class="set">
	{#each slots as slot, i (slot.id)}
		<li>
			{#if rounds > 1}
				<div class="rhead">
					<span class="display rnum">Round {i + 1}</span>
					<span class="moves">
						<button type="button" class="mv" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move round {i + 1} earlier">↑</button>
						<button type="button" class="mv" onclick={() => move(i, 1)} disabled={i === slots.length - 1} aria-label="Move round {i + 1} later">↓</button>
					</span>
				</div>
			{/if}
			<Uploader bind:prepared={slot.prepared} />
		</li>
	{/each}
</ol>

<style>
	.set { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
	.set li { display: grid; gap: 8px; }
	.rhead { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px dashed var(--line-2); padding-bottom: 6px; }
	.rnum { font-size: 1.3rem; color: var(--pink); }
	.moves { display: flex; gap: 6px; }
	.mv { min-height: 34px; width: 38px; padding: 0; font-size: 1rem; }
</style>
