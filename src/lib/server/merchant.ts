export const MERCHANT_KEY = 'store_merchant_name';
export const DESCRIPTOR_KEY = 'store_statement_descriptor';

/** Who the card payment is with, and what the buyer's statement shows (Store Terms §5). */
export async function merchantInfo(db: D1Database) {
	const rows = await db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)').bind(MERCHANT_KEY, DESCRIPTOR_KEY).all<{ key: string; value: string }>();
	const get = (k: string, d: string) => rows.results.find((r) => r.key === k)?.value || d;
	const name = get(MERCHANT_KEY, 'Chandler Solomon, operating AuxRiot (Waxhaw, NC)');
	const descriptor = get(DESCRIPTOR_KEY, 'AUXRIOT');
	return { name, descriptor, line: `Card merchant: ${name} · statement descriptor: ${descriptor}` };
}
