/**
 * Signing wording and the rights schedule shape (no document imports, so the cron worker
 * can use it too). The commitment lists themselves come from the checklist document: checklist.ts.
 */

/** The buyer's acceptance statement at checkout (Seller Agreement Checklist, "Buyer acceptance shown at checkout"). */
export const buyerStatement = (beatAndPackage: string, total: string) =>
	`I am 18 or older, have authority to sign, and agree to the displayed Store Terms and Exclusive Beat License for ${beatAndPackage}. I understand when delivery activates exclusivity and the refund rules. By selecting ‘Sign and pay ${total}’ I sign this order electronically.`;

/** Store Terms "Electronic records": separate consent to electronic delivery, and confirming PDF access. */
export const RECORDS_CONSENT =
	'I agree to receive this order’s agreement, receipt and any required disclosures electronically, and I can open and save PDF files. I can ask hello@auxriot.com for paper copies at no charge or withdraw this consent for future disclosures.';

/** Rights schedule (License §1, §5): every line is answered, "none" included. */
export type RightsSchedule = {
	writers: string; // writers, co-producers and publishers with shares
	samples: string; // 'none' or what's sampled + clearance references
	ai: string; // 'none' or materially AI-generated elements + tool terms
	voice: string; // 'none' or recognizable voice/likeness + permission
	restrictions: string; // 'none' or tool/license limits on transfer or commercial use
};
export const RIGHTS_LABELS: Record<keyof RightsSchedule, string> = {
	writers: 'Writers, co-producers and publishers',
	samples: 'Samples and third-party material',
	ai: 'Materially AI-generated elements',
	voice: 'Recognizable voice or likeness',
	restrictions: 'Tool or license restrictions'
};
export const rightsText = (r: RightsSchedule | null) =>
	r ? (Object.keys(RIGHTS_LABELS) as (keyof RightsSchedule)[]).map((k) => `${RIGHTS_LABELS[k]}: ${r[k] || 'none'}`).join('; ') : '';

export const parseRights = (s: string | null): RightsSchedule | null => {
	try {
		return s ? (JSON.parse(s) as RightsSchedule) : null;
	} catch {
		return null;
	}
};
