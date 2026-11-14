<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	const sections: { h: string; qs: { q: string; a: string }[] }[] = $derived([
		{
			h: 'Getting started',
			qs: [
				{ q: 'Is AuxRiot free?', a: 'Yes. Battling, voting and commenting are free.' },
				{ q: 'Who can join?', a: 'Anyone 18 or older. Sign up with email, then confirm it — a confirmed email is needed to vote.' },
				{ q: 'How do battles work?', a: 'Post a beat (2:00 max), the first producer to answer takes the other corner, and the crowd scores both. The full breakdown is on <a href="/rules">How battles go down</a>.' }
			]
		},
		{
			h: 'Voting',
			qs: [
				{
					q: "Why can't I vote?",
					a: `A few things have to line up: you're logged in, your email is confirmed, you've played at least 75% of <strong>both</strong> beats, and you're not one of the battlers.${data.voterWait ? ` New accounts also wait ${data.voterWait} before their first vote.` : ''}`
				},
				{ q: 'Can I change my vote?', a: "Yes — until voting closes. Scores stay sealed until then, so nobody sees how it's going." },
				{ q: 'Do I get anything for judging?', a: 'Yes: +10 battle credits for each battle you judge, paid when voting closes, as long as your vote counts. Up to 10 a day. See <a href="/credits">Credits</a>.' },
				{ q: "Why didn't my vote count?", a: "Our fair-play checks quietly discount votes that look like alt accounts or rigging (for example, sharing a device with a battler). We don't say which check tripped, so it can't be gamed." }
			]
		},
		{
			h: 'Credits',
			qs: [
				{ q: 'What are battle credits?', a: 'Points you earn by battling (+100 win, +50 tie, +25 loss) and judging (+10). Spend 250 to promote a battle at the top of the feed for 3 hours.' },
				{ q: 'Can I buy, sell or cash out credits?', a: "No. Credits have no cash value and can't be transferred." }
			]
		},
		{
			h: 'Your account',
			qs: [
				{ q: 'I forgot my password.', a: 'Use <a href="/forgot">Forgot password</a> on the login page — we\'ll email you a reset link that works for an hour.' },
				{ q: "I didn't get my confirmation email.", a: 'Check spam, then use "Resend link" in the bar at the top of the site once you\'re logged in.' },
				{ q: 'Can I change my username or email?', a: 'Not from settings yet — email <a href="mailto:hello@auxriot.com">hello@auxriot.com</a> from your account email and we\'ll sort it out.' },
				{ q: 'How do I change my picture, bio or links?', a: '<a href="/settings/profile">Edit profile</a> from the menu.' },
				{ q: 'How do I stop emails?', a: 'Turn off battle alerts or news in <a href="/settings/profile">settings</a>, or use the unsubscribe link at the bottom of any email. Password and confirmation emails always come through.' },
				{ q: 'How do I delete my account?', a: 'Email <a href="mailto:hello@auxriot.com">hello@auxriot.com</a> from your account email. The <a href="/privacy">Privacy Policy</a> explains what we keep (anonymous battle results stay so past scores add up).' }
			]
		},
		{
			h: 'Safety & copyright',
			qs: [
				{ q: 'Someone is harassing me or cheating.', a: 'Use the Report link on the comment or battle. Moderators review every report.' },
				{ q: 'Someone posted my beat.', a: 'File a takedown on the <a href="/dmca">DMCA page</a>. Valid notices get the beat removed.' },
				{ q: 'Can I use samples?', a: "You're responsible for clearing anything you sample. Beats are removed on valid copyright notices, and repeat offenders lose their accounts." }
			]
		}
	]);
</script>

<svelte:head><title>FAQ · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Help</p>
<h1 class="headline">Questions, <span>answered.</span></h1>
<p class="sub">Quick answers. For how battles and scoring work, see <a href="/rules">How battles go down</a>.</p>

{#each sections as s (s.h)}
	<section>
		<h2>{s.h}</h2>
		{#each s.qs as item (item.q)}
			<details>
				<summary>{item.q}</summary>
				<p>{@html item.a}</p>
			</details>
		{/each}
	</section>
{/each}

<div class="contact">
	<p class="display">Still stuck?</p>
	<p>Email <a href="mailto:hello@auxriot.com">hello@auxriot.com</a> — a real person reads it.</p>
</div>

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(2.8rem, 13vw, 4.6rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.sub { color: var(--dim); margin: 10px 0 18px; }
	section { margin-bottom: 22px; }
	h2 { font-size: 1.5rem; margin: 0 0 8px; }
	details { border-top: 1px solid var(--line); }
	details:last-child { border-bottom: 1px solid var(--line); }
	summary { cursor: pointer; list-style: none; padding: 14px 28px 14px 0; position: relative; font-weight: 700; }
	summary::-webkit-details-marker { display: none; }
	summary::after { content: '+'; position: absolute; right: 4px; top: 10px; font-family: var(--display); font-size: 1.4rem; color: var(--pink); }
	details[open] summary::after { content: '−'; }
	details p { margin: 0 0 14px; color: var(--dim); line-height: 1.55; }
	.contact { background: var(--ink-2); border-left: 4px solid var(--pink); border-radius: var(--radius); padding: 14px 16px; margin-top: 10px; }
	.contact .display { font-size: 1.5rem; margin: 0 0 4px; }
	.contact p { margin: 0; }
</style>
