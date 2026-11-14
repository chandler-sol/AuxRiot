/**
 * Procedural test beats for the beta seeding page: drums, bass, chords and a
 * little melody, rendered offline in the browser, then run through the same
 * MP3 encoder and waveform code as a real upload. Every call sounds different.
 */
import { prepareAudio, type PreparedAudio } from './audio-prep.ts';

const RATE = 44100;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

type Style = { name: string; bpm: [number, number]; kick: number[]; snare: number[]; hats: 8 | 16; swing: number };
// Patterns are 16 steps per bar.
const STYLES: Style[] = [
	{ name: 'trap', bpm: [130, 150], kick: [0, 7, 10], snare: [8], hats: 16, swing: 0 },
	{ name: 'boom bap', bpm: [84, 96], kick: [0, 3, 10], snare: [4, 12], hats: 8, swing: 0.18 },
	{ name: 'house', bpm: [118, 126], kick: [0, 4, 8, 12], snare: [4, 12], hats: 16, swing: 0.05 }
];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PROGS = [[0, 5, 3, 4], [0, 3, 4, 3], [0, 6, 5, 4], [0, 4, 5, 3], [5, 3, 0, 4]];

export type BeatInfo = { style: string; bpm: number; seconds: number };

export async function renderBeat(): Promise<{ wav: File; info: BeatInfo }> {
	const style = pick(STYLES);
	const bpm = Math.round(rnd(...style.bpm));
	const step = 60 / bpm / 4;
	const bars = Math.max(4, Math.round((rnd(14, 22) / (step * 16)) / 2) * 2);
	const seconds = bars * 16 * step + 1;
	const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
	const master = ctx.createGain();
	master.gain.value = 0.8;
	const comp = ctx.createDynamicsCompressor();
	master.connect(comp).connect(ctx.destination);

	const noise = ctx.createBuffer(1, RATE, RATE);
	const nd = noise.getChannelData(0);
	for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

	const root = Math.round(rnd(36, 43));
	const scale = Math.random() < 0.7 ? MINOR : MAJOR;
	const prog = pick(PROGS);
	const deg = (d: number, oct = 0) => root + scale[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7));
	const t = (bar: number, s: number) => (bar * 16 + s) * step + (s % 2 ? style.swing * step : 0);

	const kick = (at: number) => {
		const o = ctx.createOscillator(), g = ctx.createGain();
		o.frequency.setValueAtTime(150, at);
		o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
		g.gain.setValueAtTime(1, at);
		g.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
		o.connect(g).connect(master);
		o.start(at); o.stop(at + 0.45);
	};
	const hit = (at: number, freq: number, type: BiquadFilterType, len: number, vol: number) => {
		const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
		s.buffer = noise;
		f.type = type; f.frequency.value = freq;
		g.gain.setValueAtTime(vol, at);
		g.gain.exponentialRampToValueAtTime(0.001, at + len);
		s.connect(f).connect(g).connect(master);
		s.start(at, Math.random() * 0.5, len + 0.05);
	};
	const tone = (at: number, len: number, midi: number, type: OscillatorType, vol: number, cutoff: number) => {
		const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
		o.type = type; o.frequency.value = hz(midi);
		f.type = 'lowpass'; f.frequency.value = cutoff;
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
		g.gain.exponentialRampToValueAtTime(0.0001, at + len);
		o.connect(f).connect(g).connect(master);
		o.start(at); o.stop(at + len + 0.05);
	};

	const lead: OscillatorType = pick(['square', 'triangle', 'sawtooth']);
	const motif = Array.from({ length: 8 }, () => (Math.random() < 0.35 ? null : Math.floor(rnd(0, 8))));
	for (let bar = 0; bar < bars; bar++) {
		const chord = prog[bar % prog.length];
		const intro = bar < 2;
		for (let s = 0; s < 16; s++) {
			if (!intro && style.kick.includes(s)) kick(t(bar, s));
			if (!intro && style.snare.includes(s)) hit(t(bar, s), 1800, 'bandpass', 0.18, 0.7);
			if ((style.hats === 16 || s % 2 === 0) && (!intro || s % 4 === 0)) hit(t(bar, s), 8000, 'highpass', 0.04, s % 4 ? 0.12 : 0.2);
		}
		const barStart = t(bar, 0), barLen = 16 * step;
		[0, 2, 4].forEach((d) => tone(barStart, barLen * 0.98, deg(chord + d, 2), 'triangle', 0.05, 2400));
		if (!intro) tone(barStart, barLen * 0.9, deg(chord), 'sawtooth', 0.18, 380);
		if (bar >= 2 && bar % 4 !== 3) {
			motif.forEach((n, i) => {
				if (n !== null) tone(barStart + i * 2 * step, step * 1.8, deg(chord + n, 3), lead, 0.06, 3000);
			});
		}
	}
	const buf = await ctx.startRendering();
	return { wav: new File([toWav(buf)], 'test-beat.wav', { type: 'audio/wav' }), info: { style: style.name, bpm, seconds: Math.round(seconds) } };
}

function toWav(buf: AudioBuffer) {
	const ch = [buf.getChannelData(0), buf.getChannelData(1)];
	const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4));
	const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
	w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
	out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
	out.setUint32(24, RATE, true); out.setUint32(28, RATE * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
	w(36, 'data'); out.setUint32(40, n * 4, true);
	for (let i = 0, o = 44; i < n; i++) for (const c of ch) { out.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 0x7fff, true); o += 2; }
	return out.buffer;
}

/** A finished test beat, encoded and ready to upload like any other. */
export async function makeBeat(): Promise<PreparedAudio & { info: BeatInfo }> {
	const { wav, info } = await renderBeat();
	return { ...(await prepareAudio(wav, () => {})), info };
}
