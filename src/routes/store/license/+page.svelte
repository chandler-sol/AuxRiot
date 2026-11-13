<script lang="ts">
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import doc from '#lib/legal/store-license.md?raw';
</script>

<svelte:head><title>Exclusive Beat License · AuxRiot</title></svelte:head>
<p class="mono small note">This is the template every sale uses. The {'{'}placeholders{'}'} are filled in with the producer, buyer, beat and order details when someone buys.</p>
<LegalDoc source={doc} />

<style>
	.note { color: var(--dim); background: var(--ink-2); border-left: 4px solid var(--pink); padding: 10px 12px; border-radius: var(--radius); margin: 8px 0 0; font-weight: 400; }
</style>
