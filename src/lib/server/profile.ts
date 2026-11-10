import { SOCIALS } from '../socials.ts';
import { newId } from './util.ts';

export const BIO_MAX = 160;
const AVATAR_MAX_BYTES = 400 * 1024;
const HANDLE_RE = /^[A-Za-z0-9._-]{1,40}$/;

/**
 * Turn whatever the user typed (a handle like "@beats" or a full URL) into a
 * safe https URL on that platform's own domain. Returns null for empty input
 * and a string error message for invalid input.
 */
export function normalizeSocial(key: string, raw: string): string | null | { error: string } {
	const social = SOCIALS.find((s) => s.key === key);
	if (!social) return { error: 'Unknown link type.' };
	const v = raw.trim();
	if (!v) return null;

	const handle = v.replace(/^@/, '');
	if (social.template && HANDLE_RE.test(handle) && !v.includes('/')) {
		return social.template.replace('{h}', handle);
	}

	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
	} catch {
		return { error: `${social.label}: enter a handle or a link.` };
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: `${social.label}: links must start with https://` };
	url.protocol = 'https:';
	if (url.username || url.password || url.port) return { error: `${social.label}: that link doesn't look right.` };
	const host = url.hostname.toLowerCase();
	if (social.hosts && !social.hosts.includes(host)) {
		return { error: `${social.label}: link must be on ${social.hosts[0]}.` };
	}
	if (!social.hosts && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { error: 'Website: enter a valid address.' };
	if (url.pathname === '/' && social.hosts) return { error: `${social.label}: include your profile path.` };
	const out = url.toString();
	if (out.length > 300) return { error: `${social.label}: link is too long.` };
	return out;
}

export function parseSocials(json: string | null | undefined): Record<string, string> {
	try {
		const o = JSON.parse(json || '{}');
		const clean: Record<string, string> = {};
		for (const s of SOCIALS) if (typeof o[s.key] === 'string' && o[s.key].startsWith('https://')) clean[s.key] = o[s.key];
		return clean;
	} catch {
		return {};
	}
}

/** Accept only small WebP/JPEG/PNG images (the browser already crops and shrinks them). */
export async function storeAvatar(bucket: R2Bucket, file: File): Promise<string | { error: string }> {
	if (file.size === 0) return { error: 'Empty image.' };
	if (file.size > AVATAR_MAX_BYTES) return { error: 'Image is too large.' };
	const bytes = new Uint8Array(await file.arrayBuffer());
	let type = '';
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = 'image/jpeg';
	else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) type = 'image/png';
	else if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') type = 'image/webp';
	if (!type) return { error: 'Use a JPEG, PNG or WebP image.' };
	const ext = type.split('/')[1].replace('jpeg', 'jpg');
	const key = `avatars/${newId(16)}.${ext}`;
	await bucket.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
	return key;
}
