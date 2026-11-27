<script lang="ts">
	// Plain-language answers to the Store Terms and Exclusive Beat License (version 5).
	// If one of these ever disagrees with the documents, the documents win (said on the page).
	const sections: { h: string; qs: { q: string; a: string }[] }[] = [
		{
			h: 'Buying a beat',
			qs: [
				{ q: 'What am I actually buying?', a: 'An <strong>exclusive license</strong> to one beat: you are the only buyer, ever. It is a contract between you and the producer, signed by both of you. AuxRiot arranges the sale, delivers the files and handles refunds. Read the full <a href="/store/license">Exclusive Beat License</a>.' },
				{ q: "What's the difference between Exclusive and Exclusive + Stems?", a: 'Both give the same exclusivity. Exclusive + Stems also includes the separated tracks (a ZIP) so you can remix and mix the beat yourself. Stems are included only when the listing says so.' },
				{ q: 'When can I buy?', a: 'Once the battle has finished voting, so nobody can sway a vote with a purchase. Checkout is open to buyers in the United States for now.' },
				{ q: 'What can I do with the beat?', a: 'Pretty much everything: write and release songs on it, stream, sell downloads and physical copies, perform it, and use it in videos, films, ads and games. No caps on streams, sales or revenue. You can also release the instrumental as delivered. What you can\'t do is resell the raw beat or stems for someone else to make music with.' },
				{ q: 'Do I have to credit the producer?', a: 'Yes. Credit them as “Prod. by [their credit name]” wherever the release metadata or credits support it. An accidental omission can be fixed in the next update.' },
				{ q: 'Who gets the songwriting money?', a: 'Composition income on your releases (performance, mechanical and the composition side of sync fees) is split 50/50 between the producer side and your side. You keep the master-side income. The producer gets no extra master royalty or points. The license includes a split sheet for new songs.' },
				{ q: 'Do I pay sales tax?', a: 'Where tax applies, it is added on the payment screen before you pay.' },
				{ q: 'What shows up on my card statement?', a: 'Checkout tells you before you pay: who the card merchant is and the exact statement descriptor. It is on your receipt too.' }
			]
		},
		{
			h: 'After you pay',
			qs: [
				{ q: 'When does the license start?', a: 'Paying <strong>reserves</strong> the beat for you and takes it off the market. Your exclusive license starts when your first download of the beat or stems finishes. Opening the license or playing the preview doesn\'t count.' },
				{ q: 'How long do I have to download?', a: '14 days from when the files become available. If nothing is downloaded by then, the order is canceled and refunded in full automatically. We remind you 3 days before.' },
				{ q: 'Can I download again later?', a: 'Yes. Once the license is active you can download again from <a href="/purchases">Your purchases</a> while the service and lawful access last. Keep your own copies too.' },
				{ q: 'Where is my signed license?', a: 'On <a href="/purchases">Your purchases</a>, with a Save as PDF button, and linked in your receipt email. It shows both signatures, the files, the price and the versions you agreed to.' },
				{ q: 'I bought it for my label or company. Is that OK?', a: 'Yes. At checkout choose “A company or label”, enter its legal name and your role. The license names the company as the buyer.' }
			]
		},
		{
			h: 'Refunds and problems',
			qs: [
				{ q: 'Can I get a refund?', a: 'Before your first download: yes, cancel any time from Your purchases for a full refund. After the license is active, a change of mind doesn\'t qualify, but missing, broken or materially different files do, and so does a beat that turns out not to have the rights it promised.' },
				{ q: 'The files are broken or not what was listed.', a: 'Email <a href="mailto:hello@auxriot.com">hello@auxriot.com</a> with your order number. We fix or replace them, or refund you if that doesn\'t work.' },
				{ q: 'What if a copyright claim blocks my files?', a: 'We email you the exact deadline. While blocked you can ask for a full refund right away. If the files are still blocked at 5 p.m. Eastern on the 14th business day, we refund you automatically. If access comes back first and you haven\'t asked for a refund, your order continues.' },
				{ q: 'How long does a refund take?', a: 'We start it right away and tell you. Your bank decides when it shows up. Refunds go back to the card you paid with and include any tax.' },
				{ q: 'Do I need an account to keep my files?', a: 'Even if your account is suspended or closed, your license stays valid. Email hello@auxriot.com and, after we verify you, we send download links that work for 7 days.' }
			]
		},
		{
			h: 'Selling your beats',
			qs: [
				{ q: 'Which beats can I sell?', a: 'Your own beats from your AuxRiot battles. Open the battle and hit <strong>Sell this beat</strong>. Each round of a best-of-3 or best-of-5 sells on its own.' },
				{ q: 'What does it cost?', a: 'AuxRiot takes 20% of the price. Card processing (about 2.9% + 30¢) comes out of your share. Example: a $100 sale earns AuxRiot $20, processing costs $3.20, and you get $76.80. The sell page shows your exact net before you list.' },
				{ q: 'How and when do I get paid?', a: 'Through Stripe, weekly on Mondays, from your available balance. Set it up under <a href="/settings/payouts">Payouts</a>. Stripe handles identity, bank and tax details.' },
				{ q: 'Why do I sign every listing?', a: 'Your signed listing is the offer the buyer accepts. You sign once to enable selling, then each beat: answer the rights schedule (writers, samples, AI elements, voice or likeness, restrictions; "none" counts as an answer), tick the commitments and type your legal name. We remember your last answers so the next listing is quicker, but you still review and sign each one.' },
				{ q: 'Can I change a listing after it is up?', a: 'Details like BPM, key and mood, yes. Changing the price, files, credit, signer or rights schedule changes the offer, so you sign again. To swap files, take it off the store first.' },
				{ q: 'Can I sell the same beat somewhere else too?', a: 'No. It is exclusive: remove other buy-now or lease offers before listing here, and once a buyer downloads it, never sell or lease that beat (or a new name, tag or mix of it) to anyone else, even after a refund.' },
				{ q: 'What if the buyer cancels or doesn\'t download?', a: 'If nothing was delivered, the beat comes off the store and you can sign the listing again to relist it. Once anything was delivered, it can\'t be sold again.' },
				{ q: 'Who pays when a sale is refunded?', a: 'In an ordinary refund you give back your net and carry the card processing ($3.20 on a $100 sale); AuxRiot returns its fee. If it was card fraud, our mistake or a disputed copyright claim, AuxRiot carries those costs. You always get an itemized notice and 30 days to question it.' },
				{ q: 'Where can I see my sales?', a: '<a href="/settings/payouts/statements">Statements</a>: monthly sales with tax, fees, processing and refunds broken out, downloadable as a spreadsheet.' },
				{ q: 'Do I get credit on releases?', a: 'Yes, as “Prod. by [your credit name]”. You pick the credit name when you list; it can differ from your legal name, which only the buyer sees on the signed license.' }
			]
		},
		{
			h: 'Payments and safety',
			qs: [
				{ q: 'Can I pay or get paid outside AuxRiot?', a: 'Not for a listed beat. Off-site payments aren\'t allowed and aren\'t protected. Messages that mention phone numbers, emails or payment apps get a warning.' },
				{ q: 'Can I use Battle Credits in the store?', a: 'No. Credits only promote battles. They have no cash value.' },
				{ q: 'Does AuxRiot see my card?', a: 'No. Stripe handles all payments.' }
			]
		}
	];
</script>

<svelte:head><title>Store FAQ · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/store">← The store</a></p>
<h1 class="headline">Store <span>questions.</span></h1>
<p class="sub">Plain-English answers about buying and selling exclusive beats. The <a href="/store/terms">Store Terms</a> and <a href="/store/license">Exclusive Beat License</a> are the official versions; if anything here differs, they win.</p>

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
	<p>Email <a href="mailto:hello@auxriot.com">hello@auxriot.com</a> with your order number if you have one. A real person reads it.</p>
</div>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); text-decoration: none; }
	.headline { font-size: clamp(2.8rem, 13vw, 4.6rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.sub { color: var(--dim); margin: 10px 0 18px; line-height: 1.55; }
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
