<script lang="ts">
	let { providers, next = '', verb = 'Continue' }: { providers: string[]; next?: string; verb?: string } = $props();
	const q = $derived(next ? `?next=${encodeURIComponent(next)}` : '');
</script>

{#if providers.length}
	<div class="oauth">
		{#if providers.includes('google')}
			<a class="btn obtn" href="/auth/google{q}" data-sveltekit-reload>
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z" /></svg>
				{verb} with Google
			</a>
		{/if}
		{#if providers.includes('discord')}
			<a class="btn obtn" href="/auth/discord{q}" data-sveltekit-reload>
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#5865F2" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.2 18.1a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" /></svg>
				{verb} with Discord
			</a>
		{/if}
		<div class="or mono"><span>or</span></div>
	</div>
{/if}

<style>
	.oauth { display: grid; gap: 8px; }
	.obtn { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 50px; font-size: 1.1rem; }
	.or { display: flex; align-items: center; gap: 10px; color: var(--muted); margin: 6px 0 2px; font-size: 0.7rem; }
	.or::before, .or::after { content: ''; flex: 1; border-top: 1.5px dashed var(--line-2); }
</style>
