<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	const ROUNDS = [
		{
			n: '01',
			t: 'Drop it',
			d: 'Post a beat, up to 2:00. Longer files get trimmed with a short fade. Pick a 24h or 48h vote.'
		},
		{
			n: '02',
			t: 'Get called out',
			d: 'The first producer to answer takes corner B. No waiting room, no take-backs. The vote starts the moment they do.'
		},
		{
			n: '03',
			t: 'Crowd scores it',
			d: 'Voters rate both beats 1–5 on Drums, Melody, Mix and Overall — and only after hearing 75% of each.'
		},
		{
			n: '04',
			t: 'Winner gets stamped',
			d: 'Scores stay sealed until the clock hits zero. Then the winner is revealed and the record goes on both profiles.'
		}
	];
</script>

<svelte:head><title>How battles go down · AuxRiot</title></svelte:head>

<p class="mono muted kicker">The rules — read before you step up</p>
<h1 class="headline">How battles <span>go down.</span></h1>

<ol class="rounds">
	{#each ROUNDS as r (r.n)}
		<li>
			<span class="display num">{r.n}</span>
			<div>
				<h2>{r.t}</h2>
				<p>{r.d}</p>
			</div>
		</li>
	{/each}
</ol>

<section class="block">
	<h2>Battling</h2>
	<ul>
		<li>Anyone with an account can post a beat. Up to 3 of yours can wait for a challenger at once.</li>
		<li>Open battles with no challenger expire after 5 days. You get a reminder with your challenge link after 3.</li>
		<li>You can't answer your own battle.</li>
	</ul>
</section>

<section class="block">
	<h2>Voting</h2>
	<ul>
		<li>Rate each beat 1–5 on <strong>Drums</strong>, <strong>Melody</strong>, <strong>Mix</strong> and <strong>Overall</strong>.</li>
		<li>You must play at least <strong>75% of both beats</strong>. Skipped sections don't count.</li>
		<li>
			{#if data.voterWait}Accounts must be at least {data.voterWait} old to vote.{/if}
			Battlers can't vote in their own battle.
		</li>
		<li>Scores stay hidden until voting closes — only the vote count shows. You can change your vote until then.</li>
		<li>A beat's score is the average of its four category averages. Dead level? The higher Overall average wins.</li>
	</ul>
</section>

<section class="block">
	<h2>Battle credits</h2>
	<ul>
		<li>Finish a battle and earn credits: <strong>+100</strong> for a win, <strong>+50</strong> for a tie, <strong>+25</strong> for a loss.</li>
		<li>A battle pays out only with enough counted votes (votes the fair-play checks discount don't count), from up to 5 battles a day, and never between accounts on the same device.</li>
		<li>Judge battles and earn <strong>+10</strong> for each one where your vote counts — paid when voting closes, up to 10 battles a day.</li>
		<li>Spend <strong>250 credits for 3 hours</strong> in a promo slot at the top of the feed.</li>
		<li>Credits have no cash value and can't be transferred. Cheating forfeits them. <a href="/credits">Your credits</a></li>
	</ul>
</section>

<section class="block">
	<h2>Respect &amp; flair</h2>
	<ul>
		<li>Upvote comments that say something real. You can't upvote yourself, and you need a confirmed email.</li>
		<li>Upvotes on your comments earn <strong>respect</strong>. Any one person counts for at most 3, so it takes a crowd, not one fan.</li>
		<li>Respect earns flair next to your name: <strong>★ Sharp ear</strong> at 15, <strong>★★ Trusted ear</strong> at 75, <strong>★★★ Tastemaker</strong> at 250.</li>
		<li>Hidden comments stop counting, and upvotes from alt accounts never do.</li>
	</ul>
</section>

<section class="block">
	<h2>Fair play</h2>
	<p>
		We run automatic checks for alt accounts and vote rigging. Votes that look suspicious are quietly discounted, and
		accounts caught cheating may be restricted without notice. Spot something? Hit the report link on the battle.
	</p>
	<p>
		AuxRiot moderators review reports. They can hide comments, discount rigged votes, remove stolen beats and suspend
		accounts. A suspended account can't log in, post, vote or comment. Some comments are held for review before anyone
		else sees them.
	</p>
	<p class="muted small">Copyright: beats are taken down on valid DMCA notices. <a href="/dmca">How takedowns work</a>.</p>
</section>

<div class="ctas">
	<a class="btn primary" href="/battles">See live battles</a>
	{#if !data.user}<a class="btn" href="/signup">Join free</a>{/if}
</div>

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(3rem, 15vw, 5.4rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.rounds { list-style: none; margin: 24px 0 8px; padding: 0; display: grid; gap: 2px; }
	.rounds li { display: flex; gap: 16px; align-items: flex-start; background: var(--ink-2); padding: 16px; }
	.rounds li:first-child { border-radius: var(--radius) var(--radius) 0 0; }
	.rounds li:last-child { border-radius: 0 0 var(--radius) var(--radius); }
	.num { font-size: 2.6rem; line-height: 0.9; color: var(--pink); min-width: 52px; }
	.rounds h2 { margin: 2px 0 4px; font-size: 1.6rem; }
	.rounds p { margin: 0; color: var(--dim); }
	.block { margin-top: 28px; }
	.block ul { padding-left: 1.2em; color: var(--dim); }
	.block li + li { margin-top: 6px; }
	.block strong { color: var(--paper); }
	.block p { color: var(--dim); }
	.ctas { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 28px; }
</style>
