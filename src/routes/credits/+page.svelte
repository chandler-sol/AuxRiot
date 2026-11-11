<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const r = $derived(data.rules);

	const LABELS: Record<string, string> = {
		battle_win: 'Battle win',
		battle_loss: 'Battle loss',
		battle_tie: 'Battle tie',
		promo_spend: 'Promo',
		promo_refund: 'Promo refund',
		admin_grant: 'Bonus from AuxRiot',
		admin_clawback: 'Adjustment',
		battle_void: 'Battle result reversed'
	};
	const slots = $derived(Math.floor(data.balance / r.promoPrice));
</script>

<svelte:head><title>Credits · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Battle credits</p>
<div class="wallet">
	<span class="display bal">{data.balance.toLocaleString()}</span>
	<span class="mono">credits</span>
	<span class="mono worth">{slots > 0 ? `= ${slots} promo slot${slots === 1 ? '' : 's'} (${slots * r.promoHours} hours at the top of the feed)` : `${(r.promoPrice - data.balance).toLocaleString()} more for your first promo slot`}</span>
</div>

<section class="block">
	<h2>How you earn</h2>
	<div class="earn">
		<div><span class="display">+{r.win}</span><span class="mono">Win</span></div>
		<div><span class="display">+{r.tie}</span><span class="mono">Tie</span></div>
		<div><span class="display">+{r.loss}</span><span class="mono">Loss</span></div>
	</div>
	<ul class="fine">
		<li>A battle pays out when it closes with at least <strong>{data.minVotes} counted vote{data.minVotes === 1 ? '' : 's'}</strong>. Votes the fair-play checks discount don't count.</li>
		<li>Credits from up to <strong>{r.dailyCap} battles a day</strong>.</li>
		<li>Battles between accounts on the same device never pay.</li>
		<li>Credits have no cash value and can't be transferred or cashed out.</li>
	</ul>
</section>

<section class="block">
	<h2>Spend them</h2>
	<p class="muted">
		<strong class="pink">{r.promoPrice} credits = {r.promoHours} hours</strong> in a promo slot at the very top of the feed. Open the battle and hit
		<em>Promote this battle</em>. It slots in at the next opening automatically.
	</p>
	{#if data.promotable.length}
		<ul class="mine">
			{#each data.promotable as b (b.id)}
				<li><a href="/battles/{b.id}#promote">{b.creator} vs {b.challenger ?? '???'} — {b.title}</a> <span class="mono muted">{b.status === 'voting' ? 'live' : 'open'}</span></li>
			{/each}
		</ul>
	{:else}
		<p class="muted small">You don't have an open or live battle right now. <a href="/battles/new">Drop a beat</a>.</p>
	{/if}
</section>

<section class="block">
	<h2>History</h2>
	{#if data.ledger.length}
		<ul class="ledger">
			{#each data.ledger as l, i (i)}
				<li>
					<span class="what">
						<strong>{LABELS[l.reason] ?? l.reason}</strong>
						{#if l.title}<a class="muted" href="/battles/{l.ref}">{l.creator} vs {l.challenger ?? '???'}</a>{:else if l.note}<span class="muted">{l.note}</span>{/if}
						<span class="mono muted when">{new Date(l.created_at).toLocaleDateString()}</span>
					</span>
					<span class="display amt" class:neg={l.amount < 0}>{l.amount > 0 ? '+' : ''}{l.amount.toLocaleString()}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">No credits yet. Finish a battle to start earning.</p>
	{/if}
</section>

<style>
	.kicker { margin: 8px 0 10px; }
	.wallet { display: flex; flex-direction: column; background: var(--paper); color: var(--ink); border-radius: var(--radius); padding: 18px 18px 14px; }
	.bal { font-size: clamp(3.6rem, 18vw, 5.6rem); line-height: 0.9; color: var(--pink); }
	.wallet .mono { color: #5a544b; }
	.worth { margin-top: 10px; font-weight: 400; }
	.block { margin-top: 28px; }
	.earn { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; }
	.earn div { background: var(--ink-2); display: flex; flex-direction: column; align-items: center; padding: 14px 6px 12px; }
	.earn .display { font-size: 2.2rem; line-height: 1; color: var(--pink); }
	.earn .mono { color: var(--dim); margin-top: 4px; }
	.fine { color: var(--dim); padding-left: 1.2em; }
	.fine li + li { margin-top: 6px; }
	.fine strong, .muted strong { color: var(--paper); }
	.pink { color: var(--pink) !important; }
	.mine { padding-left: 1.2em; }
	.ledger { list-style: none; margin: 0; padding: 0; }
	.ledger li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
	.what { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.what a, .what span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.when { font-weight: 400; }
	.amt { font-size: 1.6rem; color: var(--good); white-space: nowrap; }
	.amt.neg { color: var(--muted); }
</style>
