<script lang="ts">
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import doc from '#lib/legal/store-terms.md?raw';
</script>

<svelte:head><title>Store Terms · AuxRiot</title></svelte:head>
<LegalDoc source={doc} />
