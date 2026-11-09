<script lang="ts">
	let { name, label, value = $bindable(0) }: { name: string; label: string; value: number } = $props();
</script>

<fieldset class="stars">
	<legend>{label}</legend>
	<div class="row-stars">
		{#each [1, 2, 3, 4, 5] as n (n)}
			<label class:on={n <= value} title="{n} star{n > 1 ? 's' : ''}">
				<input type="radio" {name} value={n} bind:group={value} required />
				<span aria-hidden="true">★</span>
				<span class="sr">{n} stars</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.stars { border: 0; padding: 0; margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	legend { float: left; font-weight: 600; font-size: 0.9rem; padding: 0; }
	.row-stars { display: flex; }
	label { margin: 0; cursor: pointer; font-size: 30px; line-height: 1; padding: 2px 3px; color: #3a3a46; transition: color 0.1s, transform 0.08s; }
	label.on { color: var(--warn); }
	label:active { transform: scale(0.85); }
	input { position: absolute; opacity: 0; width: 1px; height: 1px; }
	label:has(input:focus-visible) { outline: 2px solid var(--accent-2); border-radius: 4px; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
