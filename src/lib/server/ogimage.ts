import anton from '@fontsource/anton/files/anton-latin-400-normal.woff?inline';
import mono from '@fontsource/space-mono/files/space-mono-latin-700-normal.woff?inline';
import { battleColors } from '../colors.ts';

const toBuf = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0)).buffer;
let fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] | null = null;
function getFonts() {
	fonts ??= [
		{ name: 'Anton', data: toBuf(anton), weight: 400, style: 'normal' },
		{ name: 'Mono', data: toBuf(mono), weight: 700, style: 'normal' }
	];
	return fonts;
}

const INK = '#0e0d0b';
const PAPER = '#ede6d6';
const PINK = '#ff3d7f';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface OgBattle {
	id: string;
	title: string;
	status: string;
	creator: string;
	challenger: string | null;
	winner: string | null;
	colorA: string | null;
	colorB: string | null;
	scores: [number, number] | null;
	voteHours: number;
}

/** Shrink long names so they stay on one line in a 1080px-wide column. */
function nameSize(name: string, max: number) {
	return Math.round(Math.min(max, 2300 / Math.max(4, name.length)));
}

/** 1200×630 flyer-style share card for a battle. */
export async function renderBattleOg(b: OgBattle): Promise<ArrayBuffer> {
	const [ca, cb] = battleColors(b.id, b.colorA, b.colorB);
	const stamp =
		b.status === 'open'
			? `OPEN CHALLENGE · ${b.voteHours}H VOTE`
			: b.status === 'voting'
				? 'LIVE VOTE — SCORE IT'
				: b.status === 'closed'
					? b.winner
						? `FINAL — ${b.winner.toUpperCase()} WINS`
						: 'FINAL — DEAD EVEN'
					: 'AUXRIOT';
	const second = b.challenger
		? `<div style="display:flex;font-family:Anton;font-size:${nameSize(b.challenger, 128)}px;line-height:1;color:${cb}">${esc(b.challenger.toUpperCase())}</div>`
		: `<div style="display:flex;font-family:Anton;font-size:110px;line-height:1;color:#3a352e">???</div>`;
	const scoreLine =
		b.status === 'closed' && b.scores
			? `<div style="display:flex;font-family:Mono;font-size:30px;color:${PAPER}">${b.scores[0].toFixed(2)} — ${b.scores[1].toFixed(2)}</div>`
			: b.status === 'open'
				? `<div style="display:flex;font-family:Mono;font-size:28px;color:${PAPER}">CORNER B IS OPEN. WHO'S ANSWERING?</div>`
				: `<div style="display:flex;font-family:Mono;font-size:28px;color:${PAPER}">LISTEN TO BOTH. SCORES SEALED UNTIL CLOSE.</div>`;

	const html = `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${INK};padding:56px 64px;position:relative">
	<div style="display:flex;position:absolute;left:0;top:0;width:18px;height:315px;background:${ca}"></div>
	<div style="display:flex;position:absolute;left:0;top:315px;width:18px;height:315px;background:${b.challenger ? cb : '#3a352e'}"></div>
	<div style="display:flex;justify-content:space-between;align-items:center;width:1072px">
		<div style="display:flex;font-family:Anton;font-size:52px;color:${PAPER}">AUX<span style="color:${PINK}">RIOT</span></div>
		<div style="display:flex;font-family:Mono;font-size:24px;background:${PAPER};color:${INK};padding:10px 16px 8px">${esc(stamp)}</div>
	</div>
	<div style="display:flex;flex-direction:column;margin-top:28px;width:1072px">
		<div style="display:flex;font-family:Anton;font-size:${nameSize(b.creator, 128)}px;line-height:1;color:${ca}">${esc(b.creator.toUpperCase())}</div>
		<div style="display:flex;font-family:Anton;font-size:40px;line-height:1.15;color:#8a8274">VS</div>
		${second}
	</div>
	<div style="display:flex;flex-direction:column;margin-top:auto;gap:10px">
		<div style="display:flex;font-family:Mono;font-size:26px;color:#8a8274">"${esc(b.title.slice(0, 60))}"</div>
		${scoreLine}
	</div>
</div>`;

	// Loaded on demand: the renderer ships WebAssembly that only runs inside the Worker.
	const { ImageResponse } = await import('workers-og');
	const res = new ImageResponse(html.replace(/>\s+</g, '><'), { width: 1200, height: 630, fonts: getFonts() });
	return res.arrayBuffer();
}
