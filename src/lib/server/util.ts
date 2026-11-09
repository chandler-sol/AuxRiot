import { env as cfEnv } from 'cloudflare:workers';
const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
	const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of u8) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** Random URL-safe id. 12 bytes → 16 chars. */
export function newId(bytes = 12): string {
	return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(input: string): Promise<string> {
	return b64url(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}

/** Cloudflare bindings (D1, R2, vars). The argument is kept for call-site compatibility. */
export function getEnv(_platform?: unknown): Env {
	return cfEnv as unknown as Env;
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
