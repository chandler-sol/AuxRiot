<script lang="ts">
	import { enhance } from '$app/forms';

	let { targetType, targetId, label = 'Report' }: { targetType: 'user' | 'battle' | 'comment'; targetId: string; label?: string } =
		$props();
	let done = $state(false);
	let open = $state(false);
</script>

<details class="report" bind:open>
	<summary class="small muted">{label}</summary>
	{#if done}
		<p class="small success">Thanks — a moderator will take a look.</p>
	{:else}
		<form
			method="POST"
			action="?/report"
			class="stack"
			use:enhance={() =>
				async ({ result }) => {
					if (result.type === 'success') done = true;
				}}
		>
			<input type="hidden" name="target_type" value={targetType} />
			<input type="hidden" name="target_id" value={targetId} />
			<select name="reason" required>
				<option value="">Why are you reporting this?</option>
				<option value="fake_votes">Fake / rigged votes</option>
				<option value="alt_account">Alt account or sockpuppet</option>
				<option value="stolen_beat">Stolen beat</option>
				<option value="harassment">Harassment</option>
				<option value="spam">Spam</option>
				<option value="other">Other</option>
			</select>
			<textarea name="details" maxlength="1000" placeholder="Details (optional)"></textarea>
			<button>Send report</button>
		</form>
	{/if}
</details>

<style>
	.report summary { cursor: pointer; list-style: none; display: inline; }
	.report summary::-webkit-details-marker { display: none; }
	.report[open] { display: block; width: 100%; margin-top: 8px; }
	.report form { margin-top: 8px; }
</style>
