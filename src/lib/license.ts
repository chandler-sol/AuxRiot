/**
 * Fills the Exclusive Beat License template (src/lib/legal/store-license.md).
 * Shared by the signed license page and the live preview at checkout, so the
 * buyer sees exactly the document they're agreeing to.
 */

/** Escape for both HTML (the Markdown renderer passes raw HTML through) and Markdown syntax. */
export const safe = (s: string | null | undefined) =>
	String(s ?? '')
		.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
		.replace(/([\\|*_`[\]#])/g, '\\$1')
		.replace(/\s+/g, ' ')
		.trim();

const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export type LicenseFields = {
	producerName: string | null;
	producerSignedAt: number | null;
	buyerName: string | null;
	/** null while previewing at checkout (they sign when they pay) */
	buyerSignedAt: number | null;
	beatTitle: string;
	priceCents: number;
	saleDate: number | null;
	orderNumber: string | null;
	deliveredFiles: string;
	samples: string | null;
};

export function fillLicense(doc: string, f: LicenseFields) {
	const pending = (s: string) => `*${s}*`;
	const buyer = safe(f.buyerName) || pending('your full legal name');
	const fill: Record<string, string> = {
		producer_name: safe(f.producerName) || pending('producer'),
		buyer_name: buyer,
		beat_title: safe(f.beatTitle),
		price: (f.priceCents / 100).toFixed(2),
		currency: 'USD',
		date: f.saleDate ? day(f.saleDate) : pending('the day you pay'),
		order_number: f.orderNumber ? safe(f.orderNumber) : pending('assigned at payment'),
		delivered_files: safe(f.deliveredFiles),
		sample_disclosures: safe(f.samples || 'none'),
		producer_signature_and_date: f.producerSignedAt ? `/s/ ${safe(f.producerName)}, signed electronically ${day(f.producerSignedAt)}` : pending('signed when listed'),
		buyer_signature_and_date: f.buyerSignedAt ? `/s/ ${buyer}, signed electronically ${day(f.buyerSignedAt)}` : pending(`/s/ ${f.buyerName ? safe(f.buyerName) : 'your name'}, signed when you pay`)
	};
	return doc.replace(/\{(\w+)\}/g, (m, k: string) => (k in fill ? fill[k] : m));
}

/** "WAV master (untagged) + stems (ZIP)" */
export function deliveredFiles(format: string | null, tagged: boolean, stems: boolean) {
	return [`${(format ?? 'audio').toUpperCase()} master${tagged ? ' (producer tag included)' : ' (untagged)'}`, stems ? 'stems (ZIP)' : ''].filter(Boolean).join(' + ');
}

/** The short version at the top of the license, as plain bullet strings. */
export function licenseHighlights(doc: string) {
	const part = doc.split('## The short version')[1]?.split('\n## ')[0] ?? '';
	return part
		.split('\n')
		.filter((l) => l.startsWith('- '))
		.map((l) => l.slice(2).trim());
}
