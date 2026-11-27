<script lang="ts">
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import doc from '#lib/legal/store-license.md?raw';
	// Show the fill-in fields as readable blanks: {producer_credit} → [producer credit]
	const template = doc.replace(/\{(\w+)\}/g, (_, k: string) => `*[${k.replaceAll('_', ' ')}]*`);
</script>

<svelte:head><title>Exclusive Beat License · AuxRiot</title></svelte:head>
<p class="mono small note">This is the license every sale uses. The bracketed fields are filled in for each order: the producer and buyer, the beat and files, the price, and both electronic signatures. Orders keep the version they were signed under.</p>
<LegalDoc source={template} />

<style>
	.note { color: var(--dim); background: var(--ink-2); border-left: 4px solid var(--pink); padding: 10px 12px; border-radius: var(--radius); margin: 8px 0 0; font-weight: 400; line-height: 1.55; }
</style>
