import { newId, sha256 } from './util.ts';

/** Site Terms of Service + Privacy Policy version. Bump on a material change: users accept again. */
export const TERMS_VERSION = '2026-11-27-v5';

export type AcceptanceKind = 'seller_account' | 'listing' | 'order' | 'site_terms';

/**
 * Keep an electronic signature/acceptance record: who, what exact words, which document
 * version, and a snapshot of the terms shown (License §7 "signature record").
 */
export async function recordAcceptance(
	env: Env,
	a: {
		kind: AcceptanceKind; userId: string; subjectId?: string | null; docVersion: string; statement: string;
		signerName?: string | null; capacity?: string | null; entity?: string | null; snapshot?: unknown; request?: Request;
	}
) {
	const id = newId();
	const ip = a.request?.headers.get('cf-connecting-ip') ?? '';
	const ipHash = ip ? await sha256(`${env.SIGNAL_SALT ?? 'auxriot'}:accept:${ip}`) : null;
	await env.DB.prepare(
		`INSERT INTO acceptances (id, kind, user_id, subject_id, doc_version, signer_name, capacity, entity, statement, snapshot, ip_hash, user_agent, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	)
		.bind(
			id, a.kind, a.userId, a.subjectId ?? null, a.docVersion, a.signerName ?? null, a.capacity ?? null, a.entity ?? null, a.statement,
			a.snapshot === undefined ? null : JSON.stringify(a.snapshot), ipHash, a.request?.headers.get('user-agent')?.slice(0, 300) ?? null, Date.now()
		)
		.run();
	return id;
}

/** "Owner of Beatworks LLC" / "self" → how a signer is described on the license. */
export function partyLine(name: string | null, capacity: string | null, entity: string | null) {
	if (!name) return null;
	return entity ? `${entity}, signed by ${name} (${capacity || 'authorized signer'})` : `${name} (signing as self)`;
}

/** Clean a typed name / short field. */
export const clean = (v: FormDataEntryValue | null, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
