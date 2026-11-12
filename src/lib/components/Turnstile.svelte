<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Cloudflare Turnstile, rendered explicitly so it also works after client-side
	 * navigation. The token goes in the form as `cf-turnstile-response`. Call
	 * reset() after a failed submit: tokens are single-use.
	 */
	let { siteKey, action }: { siteKey: string; action: string } = $props();
	let el: HTMLDivElement;
	let widgetId: string | undefined;

	type TS = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
	const ts = () => (window as unknown as { turnstile?: TS }).turnstile;

	function load(): Promise<void> {
		if (ts()) return Promise.resolve();
		return new Promise((resolve, reject) => {
			let s = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
			if (!s) {
				s = document.createElement('script');
				s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
				s.async = true;
				s.defer = true;
				s.dataset.turnstile = '1';
				document.head.appendChild(s);
			}
			s.addEventListener('load', () => resolve(), { once: true });
			s.addEventListener('error', () => reject(new Error('turnstile load failed')), { once: true });
		});
	}

	onMount(() => {
		let gone = false;
		load()
			.then(() => {
				if (gone || !ts()) return;
				widgetId = ts()!.render(el, { sitekey: siteKey, action, theme: 'dark', 'response-field-name': 'cf-turnstile-response' });
			})
			.catch(() => {});
		return () => {
			gone = true;
			if (widgetId) ts()?.remove(widgetId);
		};
	});

	export function reset() {
		if (widgetId) ts()?.reset(widgetId);
	}
</script>

<div bind:this={el} class="turnstile"></div>

<style>
	.turnstile { min-height: 65px; }
</style>
