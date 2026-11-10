<script lang="ts">
	type Cat = 'drums' | 'melody' | 'mix' | 'overall';
	type Scores = Record<Cat, number>[];

	let { names, scores = $bindable() }: { names: [string, string]; scores: Scores } = $props();

	const CATS: [Cat, string][] = [
		['drums', 'Drums'],
		['melody', 'Melody'],
		['mix', 'Mix'],
		['overall', 'Overall']
	];
	const SIDES = [
		{ slot: 0, color: 'var(--a)' },
		{ slot: 1, color: 'var(--b)' }
	];
</script>

<div class="grid" role="group" aria-label="Scorecard">
	<span></span>
	{#each SIDES as side (side.slot)}
		<span class="who display" style:color={side.color}>{names[side.slot]}</span>
	{/each}

	{#each CATS as [key, label] (key)}
		<span class="cat display">{label}</span>
		{#each SIDES as side (side.slot)}
			<fieldset class="pips" style:--c={side.color}>
				<legend class="sr">{names[side.slot]} — {label}</legend>
				{#each [1, 2, 3, 4, 5] as n (n)}
					<label class="pip" class:on={n <= scores[side.slot][key]} title="{n} of 5">
						<input type="radio" name="s{side.slot}_{key}" value={n} bind:group={scores[side.slot][key]} required />
						<span class="sr">{n}</span>
					</label>
				{/each}
			</fieldset>
		{/each}
	{/each}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: minmax(64px, auto) 1fr 1fr;
		align-items: center;
		gap: 12px 10px;
	}
	.who { font-size: 1.05rem; letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cat { font-size: 1.15rem; color: var(--dim); letter-spacing: 0.03em; }
	.pips { display: flex; gap: 4px; border: 0; margin: 0; padding: 0; min-width: 0; }
	.pip {
		position: relative;
		flex: 1 1 0; max-width: 26px; aspect-ratio: 1;
		margin: 0; padding: 0;
		border: 1.5px solid #4a443b; border-radius: 2px;
		cursor: pointer; transition: background 0.08s, border-color 0.08s, transform 0.08s;
	}
	.pip.on { background: var(--c); border-color: var(--c); }
	.pip:active { transform: scale(0.85); }
	.pip input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
	.pip:has(input:focus-visible) { outline: 2px solid var(--paper); outline-offset: 1px; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
