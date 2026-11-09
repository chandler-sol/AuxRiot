/**
 * Runs entirely in the uploader's browser, so we pay nothing for transcoding:
 * decode any format the browser understands → trim to 2:00 (with a short fade)
 * → compute waveform peaks → encode to 128 kbps MP3 in a Web Worker.
 */

export const MAX_SECONDS = 120;
const SAMPLE_RATE = 44100;
const FADE_SECONDS = 1.5;
export const PEAK_BINS = 160;
export const FREE_KBPS = 128;

export interface PreparedAudio {
	blob: Blob;
	peaks: number[];
	duration: number;
	originalDuration: number;
	trimmed: boolean;
}

export async function prepareAudio(file: File, onProgress: (stage: string, pct?: number) => void): Promise<PreparedAudio> {
	onProgress('Reading file…');
	const raw = await file.arrayBuffer();

	onProgress('Decoding…');
	// An OfflineAudioContext at 44.1 kHz resamples on decode, whatever the source rate.
	const decoder = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE);
	let decoded: AudioBuffer;
	try {
		decoded = await decoder.decodeAudioData(raw);
	} catch {
		throw new Error("Your browser couldn't read that file. Try MP3, WAV or M4A.");
	}

	const originalDuration = decoded.duration;
	const trimmed = originalDuration > MAX_SECONDS;
	const length = Math.min(decoded.length, MAX_SECONDS * SAMPLE_RATE);
	const left = decoded.getChannelData(0).slice(0, length);
	const right = (decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : decoded.getChannelData(0)).slice(0, length);

	if (trimmed) {
		const fade = Math.floor(FADE_SECONDS * SAMPLE_RATE);
		for (let i = 0; i < fade; i++) {
			const g = 1 - i / fade;
			left[length - fade + i] *= g;
			right[length - fade + i] *= g;
		}
	}

	const peaks = computePeaks(left, right, PEAK_BINS);

	onProgress('Encoding…', 0);
	const blob = await encode(left, right, (pct) => onProgress('Encoding…', pct));
	return { blob, peaks, duration: length / SAMPLE_RATE, originalDuration, trimmed };
}

function computePeaks(left: Float32Array, right: Float32Array, bins: number): number[] {
	const size = Math.max(1, Math.floor(left.length / bins));
	const out: number[] = [];
	let max = 0;
	for (let b = 0; b < bins; b++) {
		let peak = 0;
		const end = Math.min((b + 1) * size, left.length);
		// Stride for speed; waveform only needs an approximation.
		for (let i = b * size; i < end; i += 16) {
			const v = Math.max(Math.abs(left[i]), Math.abs(right[i]));
			if (v > peak) peak = v;
		}
		out.push(peak);
		if (peak > max) max = peak;
	}
	return out.map((p) => Math.round((max ? p / max : 0) * 255));
}

function encode(left: Float32Array, right: Float32Array, onPct: (pct: number) => void): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (e) => {
			if (e.data.type === 'progress') onPct(e.data.pct);
			else if (e.data.type === 'done') {
				worker.terminate();
				resolve(e.data.blob);
			}
		};
		worker.onerror = (e) => {
			worker.terminate();
			reject(new Error('Encoding failed: ' + e.message));
		};
		worker.postMessage({ left, right, sampleRate: SAMPLE_RATE, kbps: FREE_KBPS }, [left.buffer, right.buffer]);
	});
}
