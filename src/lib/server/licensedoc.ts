import docV5 from '#lib/legal/store-license.md?raw';
import docV1 from '#lib/legal/archive/store-license-2026-11-13.md?raw';
import { deliveredFiles, fileLine, fillLicense, fillLicenseV5, type LicenseV5Fields } from '#lib/license.ts';
import { parseRights, rightsText } from '#lib/signing.ts';
import { partyLine } from './acceptances.ts';
import { LICENSE_V1, STORE_DOCS_VERSION } from './store.ts';

export { merchantInfo } from './merchant.ts';

type OrderRow = {
	id: string; status: string; amount_cents: number; tax_cents: number; includes_stems: number; paid_at: number | null; delivered_at: number | null;
	buyer_legal_name: string | null; buyer_signed_at: number | null; buyer_capacity: string | null; buyer_entity: string | null; buyer_acceptance_id: string | null;
	license_version: string | null; store_terms_version: string | null; listing_version: number | null; producer_acceptance_id: string | null; merchant: string | null;
	file_manifest: string | null;
	listing_id: string; entry_id: string; producer_signature: string | null; producer_signed_at: number | null; producer_credit: string | null; producer_entity: string | null;
	producer_capacity: string | null; rights_schedule: string | null; sample_disclosure: string | null; file_format: string | null; file_name: string | null; file_size: number | null;
	tagged: number; stems_name: string | null; has_stems: number; title: string; rounds: number; round: number; seller_username: string;
};

/** The license for an order, filled in, using the version that order was signed under. */
export async function orderLicense(db: D1Database, orderId: string) {
	const o = await db
		.prepare(
			`SELECT o.id, o.status, o.amount_cents, o.tax_cents, o.includes_stems, o.paid_at, o.delivered_at, o.buyer_legal_name, o.buyer_signed_at, o.buyer_capacity,
			        o.buyer_entity, o.buyer_acceptance_id, o.license_version, o.store_terms_version, o.listing_version, o.producer_acceptance_id, o.merchant, o.file_manifest,
			        l.id AS listing_id, l.entry_id, l.producer_signature, l.producer_signed_at, l.producer_credit, l.producer_entity, l.producer_capacity, l.rights_schedule,
			        l.sample_disclosure, l.file_format, l.file_name, l.file_size, l.tagged, l.stems_name, l.stems_key IS NOT NULL AS has_stems,
			        b.title, b.rounds, e.round, u.username AS seller_username
			 FROM orders o JOIN listings l ON l.id = o.listing_id JOIN battles b ON b.id = l.battle_id JOIN entries e ON e.id = l.entry_id JOIN users u ON u.id = o.seller_id
			 WHERE o.id = ?`
		)
		.bind(orderId)
		.first<OrderRow>();
	if (!o) return null;
	const title = o.rounds > 1 ? `${o.title} (round ${o.round})` : o.title;
	if (o.license_version === LICENSE_V1 || !o.license_version) {
		return {
			row: o,
			version: o.license_version ?? LICENSE_V1,
			source: fillLicense(docV1, {
				producerName: o.producer_signature, producerSignedAt: o.producer_signed_at, buyerName: o.buyer_legal_name, buyerSignedAt: o.buyer_signed_at ?? o.paid_at,
				beatTitle: title, priceCents: o.amount_cents, saleDate: o.paid_at, orderNumber: o.id.toUpperCase(),
				deliveredFiles: deliveredFiles(o.file_format, !!o.tagged, !!(o.includes_stems && o.has_stems)), samples: o.sample_disclosure
			})
		};
	}
	// v5: the manifest and signer details were frozen on the order at checkout.
	const manifest = (() => {
		try {
			return o.file_manifest ? (JSON.parse(o.file_manifest) as { file?: string; stems?: string | null; rights?: string; producer?: { name: string; capacity: string | null; entity: string | null; at: number }; credit?: string }) : {};
		} catch {
			return {};
		}
	})();
	const producer = manifest.producer ?? { name: o.producer_signature ?? '', capacity: o.producer_capacity, entity: o.producer_entity, at: o.producer_signed_at ?? 0 };
	const fields: LicenseV5Fields = {
		producerParty: partyLine(producer.name, producer.capacity, producer.entity),
		producerCredit: manifest.credit ?? o.producer_credit ?? o.seller_username,
		buyerParty: partyLine(o.buyer_legal_name, o.buyer_capacity, o.buyer_entity),
		beatTitle: title,
		beatId: o.listing_id,
		listingVersion: o.listing_version,
		orderId: o.id.toUpperCase(),
		priceCents: o.amount_cents,
		taxCents: o.paid_at ? o.tax_cents : null,
		stems: !!o.includes_stems,
		files: manifest.file ?? fileLine(o.file_name, o.file_format, !!o.tagged, o.file_size),
		stemsFile: manifest.stems ?? o.stems_name,
		previewId: `entry ${o.entry_id}`,
		rights: manifest.rights ?? rightsText(parseRights(o.rights_schedule)),
		paidAt: o.paid_at,
		licenseVersion: o.license_version,
		storeTermsVersion: o.store_terms_version ?? STORE_DOCS_VERSION,
		merchant: o.merchant ?? '',
		deliveredAt: o.delivered_at,
		producerSignature: producer.at ? { name: producer.name, capacity: producer.capacity, at: producer.at, id: o.producer_acceptance_id } : null,
		buyerSignature: o.buyer_legal_name ? { name: o.buyer_legal_name, capacity: o.buyer_capacity, at: o.buyer_signed_at, id: o.buyer_acceptance_id } : null
	};
	return { row: o, version: o.license_version, source: fillLicenseV5(docV5, fields) };
}
