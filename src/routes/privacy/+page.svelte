<script lang="ts">
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import privacy from '#lib/legal/privacy.md?raw';
</script>

<svelte:head><title>Privacy Policy · AuxRiot</title></svelte:head>
<LegalDoc source={privacy} />
