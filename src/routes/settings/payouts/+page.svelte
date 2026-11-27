<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const s = $derived(data.status);
	// While Stripe reviews (no action needed), check again every few seconds for about a minute.
	$effect(() => {
		if (s.state !== 'pending' || s.due) return;
		let n = 0;
		const t = setInterval(() => (++n > 12 ? clearInterval(t) : invalidateAll()), 5000);
		return () => clearInterval(t);
	});
	const go = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head><title>Payouts · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Settings{#if data.mode === 'test'} · <span class="testmode">Stripe test mode</span>{/if}</p>
<h1 class="headline">Get <span>paid.</span></h1>
<p class="muted lede">
	Beat sales and services pay out through Stripe, straight to your bank — weekly, every Monday. AuxRiot keeps 20% plus the card fee; the rest is yours.
	Stripe verifies your identity once (it's the law for paying people), and AuxRiot never sees your bank details.
</p>

<section class="card status {s.state}">
	{#if s.state === 'none'}
		<p class="display big">Not set up yet</p>
		<p class="muted">Takes about 5 minutes: name, date of birth, last 4 of your SSN and a bank account. Buyers can only check out on your beats once this is done.</p>
		<form method="POST" action="?/start" use:enhance={go}><button class="primary" disabled={busy}>{busy ? 'Opening Stripe…' : 'Set up payouts'}</button></form>
	{:else if s.state === 'active'}
		<p class="display big ok">✓ Payouts on</p>
		<p class="muted">Your beats and services can sell. Money lands in your bank every Monday.{#if s.due} Stripe needs {s.due} more detail{s.due === 1 ? '' : 's'} to keep it that way.{/if}</p>
		<div class="row">
			{#if s.due}<form method="POST" action="?/start" use:enhance={go}><button class="primary" disabled={busy}>Update details</button></form>{/if}
			<form method="POST" action="?/dashboard" use:enhance={go}><button disabled={busy}>Open my Stripe dashboard</button></form>
		</div>
	{:else if s.state === 'pending'}
		{#if s.due}
			<p class="display big">Finish setting up</p>
			<p class="muted">Stripe still needs {s.due} detail{s.due === 1 ? '' : 's'} from you.</p>
			<form method="POST" action="?/start" use:enhance={go}><button class="primary" disabled={busy}>Continue with Stripe</button></form>
		{:else}
			<p class="display big">Stripe is reviewing</p>
			<p class="muted">You're all done — Stripe is confirming your details, which usually takes a few seconds to a few minutes. This page updates by itself; nothing to re-enter.</p>
		{/if}
	{:else if s.state === 'restricted'}
		<p class="display big bad">Payouts paused</p>
		<p class="muted">Stripe needs something before it can pay you{s.due ? ` (${s.due} item${s.due === 1 ? '' : 's'})` : ''}. Your sales are safe; payouts resume once it's sorted.</p>
		<div class="row">
			<form method="POST" action="?/start" use:enhance={go}><button class="primary" disabled={busy}>Fix it with Stripe</button></form>
			<form method="POST" action="?/dashboard" use:enhance={go}><button disabled={busy}>Open my Stripe dashboard</button></form>
		</div>
	{:else}
		<p class="display big">Payouts are coming soon</p>
		<p class="muted">{s.error === 'not_configured' ? "Checkout isn't switched on yet. You can still list beats now and set up payouts when it opens." : "We couldn't reach Stripe just now. Try again in a minute."}</p>
	{/if}
	{#if form?.error}<p class="error small">{form.error}</p>{/if}
</section>

<ul class="facts muted small">
	<li><strong>Schedule:</strong> weekly, on Mondays. New accounts may have a short first-payout delay set by Stripe.</li>
	<li><strong>Fees:</strong> 20% marketplace fee plus card processing (about 2.9% + 30¢), shown before you list.</li>
	<li><strong>Taxes:</strong> Stripe sends a 1099 if you pass the IRS threshold. Sales tax on purchases is collected by AuxRiot.</li>
	<li><strong>Refunds:</strong> see the <a href="/store/terms">Store Terms</a> for when a sale can be refunded. You get an itemized notice for every refund.</li>
	<li><strong>Statements:</strong> <a href="/settings/payouts/statements">monthly sales, fees and refunds →</a></li>
</ul>

<style>
	.kicker { margin: 8px 0 10px; }
	.testmode { color: var(--warn); }
	.headline { font-size: clamp(3rem, 14vw, 5rem); line-height: 0.9; margin: 0; }
	.headline span { color: var(--pink); }
	.lede { margin: 10px 0 20px; }
	.card { border: 1.5px solid var(--line-2); border-radius: var(--radius); padding: 18px; display: grid; gap: 10px; }
	.card.active { border-color: #7dff9b; }
	.card.restricted { border-color: var(--pink); }
	.card p { margin: 0; }
	.big { font-size: 2rem; line-height: 1; }
	.ok { color: #7dff9b; }
	.bad { color: var(--pink); }
	.row { display: flex; gap: 8px; flex-wrap: wrap; }
	.facts { margin: 20px 0 0; padding-left: 1.1em; display: grid; gap: 6px; line-height: 1.5; }
	.facts strong { color: var(--paper); }
</style>
