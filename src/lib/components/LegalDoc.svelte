<script lang="ts">
	import { marked } from 'marked';
	let { source }: { source: string } = $props();
	// Our own reviewed Markdown (no user input), rendered to HTML once per page.
	const html = $derived(marked.parse(source, { async: false }) as string);
</script>

<article class="legal">
	{@html html}
</article>

<style>
	.legal { max-width: 720px; padding-bottom: 20px; }
	.legal :global(h1) { font-size: clamp(2.4rem, 11vw, 4rem); line-height: 0.92; margin: 6px 0 18px; }
	.legal :global(h2) { font-size: 1.6rem; margin: 30px 0 8px; }
	.legal :global(h3) { font-size: 1.25rem; margin: 20px 0 6px; }
	.legal :global(p), .legal :global(li) { color: var(--dim); line-height: 1.6; }
	.legal :global(strong) { color: var(--paper); }
	.legal :global(ul) { padding-left: 1.2em; }
	.legal :global(li + li) { margin-top: 4px; }
	.legal :global(a) { overflow-wrap: anywhere; }
	/* "Last updated" line */
	.legal :global(> p:first-child) { font-family: var(--mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 8px 0 0; }
	/* The short version */
	.legal :global(h2:first-of-type + ul) { background: var(--ink-2); border-left: 4px solid var(--pink); border-radius: var(--radius); padding: 14px 16px 14px 34px; }
</style>
