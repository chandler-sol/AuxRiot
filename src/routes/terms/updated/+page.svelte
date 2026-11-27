<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let agreed = $state(false);
</script>

<svelte:head><title>Updated terms · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Version 5 · November 27, 2026</p>
<h1 class="headline">Updated <span>terms.</span></h1>

{#if data.accepted}
	<p class="success">You've accepted the current Terms of Service and Privacy Policy. Thanks.</p>
	<p><a href={data.next}>Back to where you were →</a></p>
{:else}
	<p class="lead">We rewrote our Terms of Service and Privacy Policy to match how AuxRiot works today, including the beat store. The main changes:</p>
	<ul class="changes">
		<li><strong>Battles and Credits:</strong> how battles, voting, respect and flair work; Credits are free, have no cash value and can't buy store beats.</li>
		<li><strong>Your uploads:</strong> what you let AuxRiot do with battle audio and store files, and how public use of a sold beat is limited.</li>
		<li><strong>Moderation and appeals:</strong> what moderators can do, how automated fairness checks work, and how to ask for human review.</li>
		<li><strong>Copyright and safety:</strong> how to report infringement, send a counter-notice, or have a private image removed (within 48 hours).</li>
		<li><strong>Responsibility and disputes:</strong> liability limits, North Carolina law, and the Union County / Western District of North Carolina courts.</li>
		<li><strong>Privacy:</strong> what store transactions and payment onboarding collect, who receives it (Cloudflare, Resend, Stripe), cookies, retention, and your rights, including in the EU, UK and California.</li>
	</ul>
	<p class="small"><a href="/terms" target="_blank">Read the Terms of Service</a> · <a href="/privacy" target="_blank">Read the Privacy Policy</a> · <a href="/store/terms" target="_blank">Store Terms</a></p>
	<form method="POST" class="accept" use:enhance>
		<input type="hidden" name="next" value={data.next} />
		<label class="agree" class:on={agreed}>
			<input type="checkbox" name="agree" bind:checked={agreed} />
			<span>I have reviewed and accept the updated Terms of Service and Privacy Policy (version 5).</span>
		</label>
		{#if form?.error}<p class="error small">{form.error}</p>{/if}
		<button class="primary" disabled={!agreed}>Accept</button>
	</form>
	<p class="small muted">Questions: hello@auxriot.com. Changes apply going forward; existing beat sales keep the license they were signed under.</p>
{/if}

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; margin: 0 0 18px; }
	.headline span { color: var(--pink); }
	.lead { line-height: 1.55; }
	.changes { display: grid; gap: 8px; line-height: 1.5; padding-left: 20px; margin: 0 0 14px; }
	.accept { display: grid; gap: 12px; margin: 16px 0; max-width: 560px; }
	.agree { display: flex; gap: 12px; align-items: flex-start; margin: 0; padding: 12px 14px; border: 1.5px solid var(--line-2); border-radius: var(--radius); text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--dim); font-size: 0.95rem; line-height: 1.5; cursor: pointer; }
	.agree.on { border-color: var(--paper); color: var(--paper); }
	.agree input { width: 22px; height: 22px; accent-color: var(--pink); flex: none; margin-top: 1px; }
	.accept button { justify-self: start; }
</style>
