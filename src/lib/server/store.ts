import { newId } from './util.ts';
import { MAX_FILE_BYTES, MAX_STEMS_BYTES } from '../store.ts';

export const FEE_KEY = 'store_fee_pct';
export const MIN_PRICE_KEY = 'store_min_price_cents';

export async function storeSettings(db: D1Database) {
	const rows = await db
		.prepare(`SELECT key, value FROM settings WHERE key IN (?, ?)`)
		.bind(FEE_KEY, MIN_PRICE_KEY)
		.all<{ key: string; value: string }>();
	const get = (k: string, d: number) => {
		const v = Number(rows.results.find((r) => r.key === k)?.value);
		return Number.isFinite(v) ? v : d;
	};
	return { feePct: get(FEE_KEY, 20), minPriceCents: get(MIN_PRICE_KEY, 2000) };
}

export type ListingRow = {
	id: string;
	battle_id: string;
	entry_id: string;
	seller_id: string;
	status: string;
	price_cents: number | null;
	stems_price_cents: number | null;
	bpm: number | null;
	music_key: string | null;
	genre: string | null;
	moods: string;
	file_key: string | null;
	file_name: string | null;
	file_size: number | null;
	file_format: string | null;
	tagged: number;
	stems_key: string | null;
	stems_name: string | null;
	stems_size: number | null;
	attested_at: number | null;
	buyer_id: string | null;
	sold_at: number | null;
	created_at: number;
	updated_at: number;
};

/** The seller's listing for their beat in this battle, creating a draft if needed. Null if they have no beat in it. */
export async function getOrCreateListing(db: D1Database, battleId: string, userId: string) {
	const entry = await db
		.prepare('SELECT id, removed FROM entries WHERE battle_id = ? AND user_id = ?')
		.bind(battleId, userId)
		.first<{ id: string; removed: number }>();
	if (!entry || entry.removed) return null;
	const existing = await db.prepare('SELECT * FROM listings WHERE entry_id = ?').bind(entry.id).first<ListingRow>();
	if (existing) return existing;
	const now = Date.now();
	await db
		.prepare(`INSERT OR IGNORE INTO listings (id, battle_id, entry_id, seller_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)`)
		.bind(newId(), battleId, entry.id, userId, now, now)
		.run();
	return db.prepare('SELECT * FROM listings WHERE entry_id = ?').bind(entry.id).first<ListingRow>();
}

/** What's still missing before a draft can go on sale. Prices under the minimum are allowed (warned in the UI). */
export function missingForListing(l: ListingRow): string[] {
	const out: string[] = [];
	if (!l.price_cents) out.push('a price');
	if (!l.file_key) out.push('the file buyers get');
	if (l.stems_price_cents && !l.stems_key) out.push('the stems zip (or remove the stems price)');
	if (l.stems_price_cents && l.price_cents && l.stems_price_cents <= l.price_cents) out.push('a stems price higher than the exclusive price');
	if (!l.attested_at) out.push('the exclusive-rights checkbox');
	return out;
}

/** Buying opens once the battle is decided (or it expired without a challenger). */
export function buyOpen(battleStatus: string) {
	return battleStatus === 'closed' || battleStatus === 'expired';
}

// ---------------------------------------------------------------------------
// File checks for the private download files

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

export function checkUploadStart(kind: 'file' | 'stems', fileName: string, size: number): { ext: string } | { error: string } {
	const ext = fileName.toLowerCase().split('.').pop() ?? '';
	if (!Number.isFinite(size) || size <= 0) return { error: 'That file looks empty.' };
	if (kind === 'file') {
		if (ext !== 'wav' && ext !== 'mp3') return { error: 'Upload a .wav or .mp3.' };
		if (size > MAX_FILE_BYTES) return { error: 'That file is over 400 MB.' };
		return { ext };
	}
	if (ext !== 'zip') return { error: 'Zip your stems into one .zip file.' };
	if (size > MAX_STEMS_BYTES) return { error: 'Stems zip is over 4 GB.' };
	return { ext };
}

/** Does the first chunk actually look like the file type it claims to be? */
export function checkMagic(ext: string, b: Uint8Array) {
	if (ext === 'wav') return b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE';
	if (ext === 'mp3') return b.length >= 3 && (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
	if (ext === 'zip') return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06);
	return false;
}
