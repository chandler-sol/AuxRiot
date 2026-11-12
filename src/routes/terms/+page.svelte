<script lang="ts">
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import terms from '#lib/legal/terms.md?raw';
</script>

<svelte:head><title>Terms of Service · AuxRiot</title></svelte:head>
<LegalDoc source={terms} />
