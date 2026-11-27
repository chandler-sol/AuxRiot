import doc from '#lib/legal/seller-checklist.md?raw';
export { buyerStatement, RECORDS_CONSENT, RIGHTS_LABELS, rightsText, parseRights, type RightsSchedule } from './signing.ts';

/**
 * The commitments in the Seller Agreement Checklist (v5), straight from the document:
 * step one (enable selling) and step two (sign each listing). Each becomes a required box.
 */
function items(section: string) {
	return section
		.split('\n')
		.filter((l) => l.startsWith('- ☐ '))
		.map((l) =>
			l
				.slice(4)
				.replace(/\s*Select “[^”]+”\.?\s*$/, '')
				.replace(/\s*Type full legal name \[[^\]]+\] and capacity \[[^\]]+\]\.?\s*$/, '')
				.trim()
		);
}

const [one, rest = ''] = doc.split('## Sign each beat listing');
const two = rest.split('\n### ')[0];

export const SELLER_ACCOUNT_ITEMS = items(one);
export const LISTING_ITEMS = items(two);
