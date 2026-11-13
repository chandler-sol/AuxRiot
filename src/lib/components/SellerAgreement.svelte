<script lang="ts">
	import { enhance } from '$app/forms';
	import { marked } from 'marked';
	import doc from '#lib/legal/seller-checklist.md?raw';

	let { action = '?/agree', error = '' }: { action?: string; error?: string } = $props();
	// Each "- [ ] **Bold.** rest" line of the checklist becomes a required checkbox.
	const items = doc
		.split('\n')
		.filter((l) => l.startsWith('- [ ] '))
		.map((l) => marked.parseInline(l.slice(6), { async: false }) as string);
	let checked = $state<boolean[]>(items.map(() => false));
	const all = $derived(checked.every(Boolean));
	let busy = $state(false);
</script>

<section class="agree card stack">
	<p class="mono small draft">Draft — pending legal review</p>
	<h2>Before your first listing</h2>
	<p class="small muted">
		Selling on AuxRiot means agreeing to the <a href="/store/terms" target="_blank">Store Terms</a> and the
		<a href="/store/license" target="_blank">Exclusive Beat License</a> every sale uses. Tick each one.
	</p>
	<form method="POST" {action} class="stack" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
		<ul>
			{#each items as html, i (i)}
				<li>
					<label class="check">
						<input type="checkbox" name="item" value={i} bind:checked={checked[i]} required />
						<span>{@html html}</span>
					</label>
				</li>
			{/each}
		</ul>
		{#if error}<p class="error small">{error}</p>{/if}
		<button class="primary" disabled={!all || busy}>{busy ? 'Saving…' : 'Agree and enable selling'}</button>
	</form>
</section>

<style>
	.agree { border: 1.5px solid var(--pink); }
	.draft { color: var(--warn); margin: 0; }
	ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.check { display: flex; gap: 10px; align-items: flex-start; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-size: 0.92rem; color: var(--dim); font-weight: 400; cursor: pointer; line-height: 1.45; }
	.check :global(strong) { color: var(--paper); }
	.check input { width: 20px; height: 20px; accent-color: var(--pink); flex: none; margin-top: 2px; }
</style>
