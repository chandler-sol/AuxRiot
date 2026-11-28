<script lang="ts">
	import { onMount } from 'svelte';

	type A = { id: string; title: string; body: string; buttonLabel: string | null; buttonUrl: string | null };
	let { announcement, preview = false }: { announcement: A; preview?: boolean } = $props();
	let open = $state(false);
	let dialog = $state<HTMLDivElement | null>(null);

	// Open after the page settles, so it never flashes during navigation.
	onMount(() => {
		const t = setTimeout(() => (open = true), preview ? 0 : 600);
		return () => clearTimeout(t);
	});
	$effect(() => {
		if (open) dialog?.focus();
	});

	function close() {
		open = false;
		if (preview) return;
		// Remember it right away; fire-and-forget (keepalive survives a link click).
		fetch('/api/announcements/dismiss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: announcement.id }), keepalive: true }).catch(() => {});
	}
	const paragraphs = $derived(announcement.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
	const external = $derived(!!announcement.buttonUrl && /^https?:\/\//.test(announcement.buttonUrl));
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="ann-title" tabindex="-1" bind:this={dialog}>
			<button class="x" type="button" aria-label="Close" onclick={close}>✕</button>
			<p class="mono kicker">Announcement</p>
			<h2 id="ann-title" class="display">{announcement.title}</h2>
			{#each paragraphs as p, i (i)}<p class="body">{p}</p>{/each}
			<div class="acts">
				{#if announcement.buttonLabel && announcement.buttonUrl}
					<a class="btn primary" href={announcement.buttonUrl} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined} onclick={close}>{announcement.buttonLabel}</a>
					<button type="button" class="ghost" onclick={close}>Not now</button>
				{:else}
					<button type="button" class="primary" onclick={close}>Got it</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.72); display: grid; place-items: center; padding: 18px; animation: fade 0.18s ease-out; }
	.modal { position: relative; width: min(100%, 460px); max-height: calc(100dvh - 36px); overflow-y: auto; background: var(--ink-2); border: 1.5px solid var(--line-2); border-top: 5px solid var(--pink); border-radius: var(--radius); padding: 22px 20px 18px; display: grid; gap: 10px; outline: none; animation: rise 0.22s ease-out; }
	.x { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; min-height: 0; padding: 0; background: transparent; border: 0; color: var(--dim); font-size: 1.1rem; cursor: pointer; }
	.x:hover { color: var(--paper); }
	.kicker { margin: 0; color: var(--pink); font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
	h2 { margin: 0; padding-right: 30px; font-size: clamp(1.8rem, 8vw, 2.4rem); line-height: 0.95; overflow-wrap: anywhere; }
	.body { margin: 0; color: var(--dim); line-height: 1.55; white-space: pre-line; overflow-wrap: anywhere; }
	.acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
	.acts .btn, .acts button { min-height: 46px; }
	.ghost { color: var(--dim); }
	@keyframes fade { from { opacity: 0; } }
	@keyframes rise { from { transform: translateY(12px); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .backdrop, .modal { animation: none; } }
</style>
