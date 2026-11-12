<script lang="ts">
	let { id, title, username }: { id: string; title: string; username: string } = $props();
	const url = $derived(`https://auxriot.com/c/${id}`);
	let copied = $state(false);
	const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			prompt('Copy your challenge link:', url);
		}
	}
	async function share() {
		try {
			await navigator.share({ title: `${username} wants smoke on AuxRiot`, text: `Come battle me: "${title}"`, url });
		} catch {
			/* cancelled */
		}
	}
</script>

<div class="share">
	<input class="mono link" readonly value={url} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} aria-label="Challenge link" />
	<div class="row">
		{#if canShare}<button class="primary" onclick={share}>Share</button>{/if}
		<button onclick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
	</div>
</div>

<style>
	.share { display: grid; gap: 8px; }
	.link { font-size: 0.75rem; padding: 10px 12px; }
	.row { display: flex; gap: 8px; }
	.row button { flex: 1; min-height: 46px; }
</style>
