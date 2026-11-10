/**
 * AuxRiot news emails. One renderer, four starting templates (matching the
 * Figma "Fill-in templates"). Used for the live preview in the admin composer
 * and for the HTML actually sent, so what you see is what subscribers get.
 * Inline styles + tables only: email clients ignore stylesheets.
 */

export type TemplateKey = 'announcement' | 'weekly' | 'event' | 'letter';

export interface NewsDraft {
	template: TemplateKey;
	subject: string;
	preheader: string;
	kicker: string;
	label: string;
	headline1: string;
	headline2: string;
	intro: string;
	imageUrl: string;
	showStats: boolean;
	stats: { value: string; label: string }[];
	battle: null | { status: string; a: string; b: string; colorA: string; colorB: string; title: string; url: string };
	sections: { title: string; body: string }[];
	buttonText: string;
	buttonUrl: string;
	buttonPink: boolean;
	signature: string;
}

const base = (t: TemplateKey): NewsDraft => ({
	template: t,
	subject: '',
	preheader: '',
	kicker: '',
	label: '',
	headline1: '',
	headline2: '',
	intro: '',
	imageUrl: '',
	showStats: false,
	stats: [
		{ value: '', label: '' },
		{ value: '', label: '' },
		{ value: '', label: '' }
	],
	battle: null,
	sections: [{ title: '', body: '' }],
	buttonText: '',
	buttonUrl: 'https://auxriot.com/battles',
	buttonPink: false,
	signature: ''
});

export const TEMPLATES: Record<TemplateKey, { name: string; blurb: string; draft: () => NewsDraft }> = {
	announcement: {
		name: 'Announcement',
		blurb: 'Features, rule changes, big news.',
		draft: () => ({
			...base('announcement'),
			subject: 'New on AuxRiot: ',
			kicker: 'Announcement',
			label: 'New feature',
			headline1: 'What happened',
			headline2: 'The hook',
			intro: "One or two sentences: what's new and why it matters to you.",
			sections: [{ title: 'What it means for you', body: "Be specific — what can you do now that you couldn't before?" }],
			buttonText: 'See it live'
		})
	},
	weekly: {
		name: 'Weekly card',
		blurb: 'Numbers, battle of the week, who is on a run.',
		draft: () => ({
			...base('weekly'),
			subject: "This week's card on AuxRiot",
			kicker: 'The weekly card',
			label: 'This week on AuxRiot',
			headline1: "This week's",
			headline2: 'card.',
			intro: 'Closest vote yet, and a new name at the top.',
			showStats: true,
			stats: [
				{ value: '0', label: 'Battles' },
				{ value: '0', label: 'Votes cast' },
				{ value: '0', label: 'New producers' }
			],
			sections: [
				{ title: 'Battle of the week', body: 'Why this one mattered — upset, landslide, a beat everyone was talking about.' },
				{ title: 'On a run', body: '1. Producer — 4-0\n2. Producer — 3-1\n3. Producer — 3-1' }
			],
			buttonText: 'See live battles'
		})
	},
	event: {
		name: 'Event',
		blurb: 'Tournaments, themed weeks, challenges.',
		draft: () => ({
			...base('event'),
			subject: 'Event: ',
			kicker: 'Event',
			label: 'Dec 1–7',
			headline1: 'Event name',
			headline2: 'The tagline',
			intro: "What it is in one sentence — who can enter and what's on the line.",
			showStats: true,
			stats: [
				{ value: 'Dec 1', label: 'Starts' },
				{ value: 'Prize', label: 'On the line' },
				{ value: '32', label: 'Spots' }
			],
			sections: [{ title: 'How it goes down', body: '1. Post a beat with the theme\n2. First answer locks in\n3. Crowd picks the winner' }],
			buttonText: 'Enter now',
			buttonPink: true
		})
	},
	letter: {
		name: 'Letter',
		blurb: 'Personal notes from you.',
		draft: () => ({
			...base('letter'),
			subject: 'A note from AuxRiot',
			kicker: 'From the founder',
			label: 'A quick note',
			headline1: 'A short title',
			headline2: 'ending in pink',
			intro: 'Hey everyone —',
			sections: [{ title: '', body: "What's on your mind.\n\nWhat's coming next, or what you need from the crowd." }],
			buttonText: '',
			signature: 'ARSENiK'
		})
	}
};

const INK = '#0e0d0b';
const INK2 = '#1a1815';
const PAPER = '#ede6d6';
const DIM = '#bdb5a3';
const MUTED = '#8a8274';
const PINK = '#ff3d7f';
const DISPLAY = "Anton,Impact,'Arial Narrow Bold','Arial Black',sans-serif";
const MONO = "'Courier New',Courier,monospace";

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const para = (s: string) => esc(s).replace(/\n/g, '<br>');
const safeUrl = (u: string) => (/^https:\/\//i.test(u.trim()) ? u.trim() : '');
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : PINK);

export function renderNewsletter(d: NewsDraft, opts: { unsubscribeUrl: string; preferencesUrl: string }) {
	const row = (inner: string, pad = '0 32px 24px') => `<tr><td style="padding:${pad}">${inner}</td></tr>`;
	const parts: string[] = [];

	parts.push(
		row(
			`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${DISPLAY};font-size:30px;letter-spacing:1px;color:${PAPER}">AUX<span style="color:${PINK}">RIOT</span></td>
<td align="right" style="font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">${esc(d.kicker)}</td></tr></table>`,
			'32px 32px 28px'
		)
	);
	if (d.label) parts.push(row(`<div style="font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">${esc(d.label)}</div>`, '0 32px 12px'));
	parts.push(
		row(
			`<div style="font-family:${DISPLAY};font-size:48px;line-height:1;text-transform:uppercase;color:${PAPER}">${esc(d.headline1)}${
				d.headline2 ? `<br><span style="color:${PINK}">${esc(d.headline2)}</span>` : ''
			}</div>`,
			'0 32px 16px'
		)
	);
	if (d.intro) parts.push(row(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.55;color:${DIM}">${para(d.intro)}</div>`, '0 32px 26px'));

	const img = safeUrl(d.imageUrl);
	if (img) parts.push(row(`<img src="${esc(img)}" width="536" alt="" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:2px">`));

	if (d.showStats) {
		const cells = d.stats
			.filter((s) => s.value || s.label)
			.map(
				(s) => `<td align="center" style="padding:14px 4px 12px">
<div style="font-family:${DISPLAY};font-size:32px;line-height:1;color:${INK}">${esc(s.value)}</div>
<div style="font-family:${MONO};font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#5a544b;padding-top:4px">${esc(s.label)}</div></td>`
			)
			.join('');
		if (cells) parts.push(row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};border-radius:2px"><tr>${cells}</tr></table>`));
	}

	d.sections.forEach((s, i) => {
		if (!s.title && !s.body) return;
		parts.push(
			row(
				`${s.title ? `<div style="font-family:${DISPLAY};font-size:24px;letter-spacing:.5px;text-transform:uppercase;color:${PAPER};padding-bottom:8px">${esc(s.title)}</div>` : ''}
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${DIM}">${para(s.body)}</div>`
			)
		);
		// Battle of the week sits right after the first section.
		if (i === 0 && d.battle) parts.push(battleBlock(d.battle));
	});
	if (!d.sections.some((s) => s.title || s.body) && d.battle) parts.push(battleBlock(d.battle));

	if (d.signature) parts.push(row(`<div style="font-family:${DISPLAY};font-size:24px;color:${PINK}">— ${esc(d.signature)}</div>`));

	const href = safeUrl(d.buttonUrl);
	if (d.buttonText && href) {
		parts.push(
			row(
				`<a href="${esc(href)}" style="display:inline-block;background:${d.buttonPink ? PINK : PAPER};color:${INK};text-decoration:none;font-family:${DISPLAY};font-size:20px;letter-spacing:1px;text-transform:uppercase;padding:14px 26px;border-radius:2px">${esc(d.buttonText)}</a>`,
				'4px 32px 28px'
			)
		);
	}

	parts.push(
		row(
			`<div style="border-top:1px dashed #3a352e;padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED}">You're getting this because you opted into AuxRiot news. Not into it? Unsubscribe anytime — one click.</div>
<div style="padding-top:10px;font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase">
<a href="${opts.unsubscribeUrl}" style="color:${DIM}">Unsubscribe</a> &nbsp;·&nbsp; <a href="${opts.preferencesUrl}" style="color:${DIM}">Email preferences</a> &nbsp;·&nbsp; <a href="https://auxriot.com" style="color:${DIM}">auxriot.com</a></div>`,
			'8px 32px 32px'
		)
	);

	const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');</style><title>${esc(d.subject)}</title></head>
<body style="margin:0;padding:0;background:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(d.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${INK}">
${parts.join('\n')}
</table></td></tr></table></body></html>`;

	const text = [
		d.label,
		[d.headline1, d.headline2].filter(Boolean).join(' '),
		d.intro,
		d.showStats ? d.stats.filter((s) => s.value || s.label).map((s) => `${s.value} ${s.label}`).join(' · ') : '',
		...d.sections.flatMap((s) => [s.title, s.body]),
		d.battle ? `${d.battle.a} vs ${d.battle.b} — ${d.battle.title} (${d.battle.status}) ${d.battle.url}` : '',
		d.signature ? `— ${d.signature}` : '',
		d.buttonText && href ? `${d.buttonText}: ${href}` : '',
		`Unsubscribe: ${opts.unsubscribeUrl}`
	]
		.filter(Boolean)
		.join('\n\n');

	return { html, text };

	function battleBlock(b: NonNullable<NewsDraft['battle']>) {
		const ca = safeColor(b.colorA);
		const cb = safeColor(b.colorB);
		const link = safeUrl(b.url);
		return row(
			`<a href="${esc(link)}" style="text-decoration:none"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK2};border-radius:2px"><tr>
<td width="8" style="background:linear-gradient(${ca} 50%,${cb} 50%);background-color:${ca}"></td>
<td style="padding:16px 18px">
<div style="font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${ca}">${esc(b.status)}</div>
<div style="font-family:${DISPLAY};font-size:38px;line-height:1;text-transform:uppercase;color:${ca};padding-top:6px">${esc(b.a)}</div>
<div style="font-family:${DISPLAY};font-size:15px;letter-spacing:3px;color:${MUTED};padding:2px 0">VS</div>
<div style="font-family:${DISPLAY};font-size:38px;line-height:1;text-transform:uppercase;color:${cb}">${esc(b.b)}</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${DIM};padding-top:6px">${esc(b.title)}</div>
</td></tr></table></a>`
		);
	}
}
