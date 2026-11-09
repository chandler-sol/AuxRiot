/// <reference lib="webworker" />
import { Mp3Encoder } from '@breezystack/lamejs';

interface Job {
	left: Float32Array;
	right: Float32Array;
	sampleRate: number;
	kbps: number;
}

function toInt16(f: Float32Array, start: number, end: number) {
	const out = new Int16Array(end - start);
	for (let i = start; i < end; i++) {
		const s = Math.max(-1, Math.min(1, f[i]));
		out[i - start] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	return out;
}

self.onmessage = (e: MessageEvent<Job>) => {
	const { left, right, sampleRate, kbps } = e.data;
	const enc = new Mp3Encoder(2, sampleRate, kbps);
	const chunks: Uint8Array[] = [];
	const block = 1152 * 20;
	let lastPct = -1;
	for (let i = 0; i < left.length; i += block) {
		const end = Math.min(i + block, left.length);
		const buf = enc.encodeBuffer(toInt16(left, i, end), toInt16(right, i, end));
		if (buf.length) chunks.push(new Uint8Array(buf));
		const pct = Math.floor((end / left.length) * 100);
		if (pct !== lastPct) {
			lastPct = pct;
			self.postMessage({ type: 'progress', pct });
		}
	}
	const tail = enc.flush();
	if (tail.length) chunks.push(new Uint8Array(tail));
	self.postMessage({ type: 'done', blob: new Blob(chunks as BlobPart[], { type: 'audio/mpeg' }) });
};
