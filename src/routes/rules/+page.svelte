<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Rules &amp; voting · AuxRiot</title></svelte:head>

<article class="card stack prose">
	<h1>How battles work</h1>
	<h2>Battling</h2>
	<ul>
		<li>Anyone with an account can post a beat. Beats are capped at 2:00 — longer files are trimmed with a short fade.</li>
		<li>The first producer to answer an open battle becomes the opponent. Voting starts immediately and runs 24 or 48 hours (the creator picks).</li>
		<li>Open battles with no challenger expire after 14 days.</li>
	</ul>
	<h2>Voting</h2>
	<ul>
		<li>Voters rate each beat 1–5 stars on <strong>Drums</strong>, <strong>Melody</strong>, <strong>Mix</strong> and <strong>Overall</strong>.</li>
		<li>You must play at least <strong>75% of both beats</strong> before your vote is accepted. Skipped sections don't count.</li>
		<li>
			{#if data.voterWait}Accounts must be at least {data.voterWait} old to vote.{/if}
			Participants can't vote in their own battle.
		</li>
		<li>Scores stay hidden until voting closes; only the number of votes is shown. You can change your vote until then.</li>
		<li>A beat's score is the average of its four category averages. If it's level, the higher Overall average wins.</li>
	</ul>
	<h2>Fair play</h2>
	<p>
		We run automatic checks for alt accounts and vote rigging. Votes that look suspicious are quietly discounted,
		and accounts caught cheating may be restricted without notice. If you spot something, use the report link on the
		battle.
	</p>
</article>

<style>
	.prose ul { padding-left: 1.2em; }
	.prose li + li { margin-top: 6px; }
	.prose h2 { margin-top: 12px; }
</style>
