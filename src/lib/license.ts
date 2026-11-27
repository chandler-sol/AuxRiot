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

// ---------------------------------------------------------------------------
// Version 5 (Nov 27, 2026): the transaction-record table and signature lines.

export type LicenseV5Fields = {
	producerParty: string | null; // "Jane Doe (signing as self)" or "Beatworks LLC, signed by Jane Doe (Owner)"
	producerCredit: string;
	buyerParty: string | null;
	beatTitle: string;
	beatId: string;
	listingVersion: number | null;
	orderId: string | null;
	priceCents: number;
	taxCents: number | null;
	stems: boolean;
	files: string; // "Neon-Highway.wav (WAV, untagged, 48 MB, file id …)"
	stemsFile: string | null;
	previewId: string;
	rights: string;
	paidAt: number | null;
	licenseVersion: string;
	storeTermsVersion: string;
	merchant: string;
	deliveredAt: number | null;
	producerSignature: { name: string; capacity: string | null; at: number; id: string | null } | null;
	buyerSignature: { name: string; capacity: string | null; at: number | null; id: string | null } | null;
};

const stamp = (ms: number) =>
	new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const usd = (c: number) => `US $${(c / 100).toFixed(2)}`;

export function fillLicenseV5(doc: string, f: LicenseV5Fields) {
	const pending = (s: string) => `*${s}*`;
	const sig = (s: LicenseV5Fields['producerSignature'] | LicenseV5Fields['buyerSignature'], label: string, waiting: string) =>
		s?.at ? `/s/ ${safe(s.name)} • ${safe(s.capacity && s.capacity !== 'self' ? s.capacity : 'self')} • ${stamp(s.at)} • ${label} ${safe(s.id ?? '—')}` : pending(waiting);
	const fill: Record<string, string> = {
		producer_party: safe(f.producerParty) || pending('producer'),
		producer_credit: safe(f.producerCredit),
		buyer_party: safe(f.buyerParty) || pending('your full legal name, filled in as you type'),
		beat_title_id: `${safe(f.beatTitle)} (ID ${safe(f.beatId)})`,
		listing_version: f.listingVersion ? `listing version ${f.listingVersion}` : pending('listing version'),
		order_id: f.orderId ? `order ${safe(f.orderId)}` : pending('order ID assigned at payment'),
		license_price: `${usd(f.priceCents)} license price, excluding tax`,
		tax_and_total: f.taxCents == null ? pending('tax and total shown on the payment screen') : `tax ${usd(f.taxCents)}, total ${usd(f.priceCents + f.taxCents)}`,
		package: f.stems ? 'Exclusive + Stems' : 'Exclusive',
		files: safe(f.files),
		stems_included: f.stems && f.stemsFile ? `stems: ${safe(f.stemsFile)}` : 'no stems',
		preview_id: `public preview ${safe(f.previewId)}`,
		rights_schedule: safe(f.rights) || 'none',
		paid_at: f.paidAt ? `paid ${stamp(f.paidAt)}` : pending('paid date and time'),
		versions: `Exclusive Beat License ${safe(f.licenseVersion)}, Store Terms ${safe(f.storeTermsVersion)}`,
		merchant: safe(f.merchant),
		delivered_at: f.deliveredAt ? `first delivered ${stamp(f.deliveredAt)}` : 'delivery pending',
		producer_signature_record: f.producerSignature ? `producer signed ${stamp(f.producerSignature.at)}` : pending('producer signature pending'),
		buyer_signature_record: f.buyerSignature?.at ? `buyer signed ${stamp(f.buyerSignature.at)}` : pending('buyer signs at checkout'),
		producer_signature_line: sig(f.producerSignature, 'listing acceptance', 'signed when listed'),
		buyer_signature_line: sig(f.buyerSignature, 'order acceptance', `/s/ ${f.buyerSignature?.name ? safe(f.buyerSignature.name) : 'your name'}, signed when you select “Sign and pay”`)
	};
	return doc
		.replace(/\{(\w+)\}/g, (m, k: string) => (k in fill ? fill[k] : m))
		.replace('Release [title and order ID]', `Release [song title] · ${f.orderId ? `order ${safe(f.orderId)}` : 'order ID'}`);
}

/** "Neon-Highway.wav (WAV, untagged, 48 MB, file id 3f2a9c…)" */
export function fileLine(name: string | null, format: string | null, tagged: boolean, size: number | null, id?: string | null) {
	const mb = size ? `${Math.max(1, Math.round(size / 1e6))} MB` : null;
	return `${name ?? 'audio file'} (${[(format ?? 'audio').toUpperCase(), tagged ? 'producer tag included' : 'untagged', mb, id ? `file id ${id}` : null].filter(Boolean).join(', ')})`;
}
