/**
 * Minimal MP3 frame walker. We never trust the browser's claimed duration:
 * the server walks every frame header to compute the real length and rejects
 * files that aren't MP3 or exceed the time limit.
 */

const BITRATES: Record<string, number[]> = {
	// MPEG1 Layer III
	'1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
	// MPEG2 / 2.5 Layer III
	'2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
};
const SAMPLE_RATES: Record<number, number[]> = {
	3: [44100, 48000, 32000], // MPEG1
	2: [22050, 24000, 16000], // MPEG2
	0: [11025, 12000, 8000] // MPEG2.5
};

export interface Mp3Info {
	durationMs: number;
	frames: number;
	maxKbps: number;
}

export function parseMp3(buf: Uint8Array): Mp3Info | null {
	let i = 0;
	// Skip ID3v2 tag if present.
	if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
		const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
		i = 10 + size + (buf[5] & 0x10 ? 10 : 0);
	}

	let frames = 0;
	let seconds = 0;
	let maxKbps = 0;
	let misses = 0;

	while (i + 4 <= buf.length) {
		if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
			// Tolerate a little junk between frames (and a trailing ID3v1 tag).
			i++;
			if (++misses > 4096) break;
			continue;
		}
		const version = (buf[i + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5, 1=reserved
		const layer = (buf[i + 1] >> 1) & 0x03; // 1 = Layer III
		const bitrateIdx = (buf[i + 2] >> 4) & 0x0f;
		const srIdx = (buf[i + 2] >> 2) & 0x03;
		const padding = (buf[i + 2] >> 1) & 0x01;
		if (version === 1 || layer !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) {
			i++;
			if (++misses > 4096) break;
			continue;
		}
		const kbps = BITRATES[version === 3 ? '1' : '2'][bitrateIdx];
		const sampleRate = SAMPLE_RATES[version][srIdx];
		const samplesPerFrame = version === 3 ? 1152 : 576;
		const frameLen = Math.floor(((samplesPerFrame / 8) * kbps * 1000) / sampleRate) + padding;
		if (frameLen < 4) break;

		frames++;
		seconds += samplesPerFrame / sampleRate;
		if (kbps > maxKbps) maxKbps = kbps;
		i += frameLen;
	}

	if (frames < 10) return null;
	return { durationMs: Math.round(seconds * 1000), frames, maxKbps };
}
