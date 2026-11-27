import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { STORE_DOCS_VERSION, buyOpen, getOrCreateListing, missingForListing, storeSettings, type ListingRow } from '#lib/server/store.ts';
import { GENRES, KEYS, MOODS, splitSale } from '#lib/store.ts';
import { clean, recordAcceptance } from '#lib/server/acceptances.ts';
import { LISTING_ITEMS, SELLER_ACCOUNT_ITEMS, RIGHTS_LABELS, type RightsSchedule } from '#lib/checklist.ts';

type ListingDefaults = { credit: string; entity: string; capacity: string; rights: RightsSchedule };

const RIGHT_KEYS = Object.keys(RIGHTS_LABELS) as (keyof RightsSchedule)[];
const parseRights = (s: string | null): RightsSchedule | null => {
	try {
		return s ? (JSON.parse(s) as RightsSchedule) : null;
	} catch {
		return null;
	}
};

async function context(locals: App.Locals, battleId: string, path: string, round = 1) {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(path)}`);
	const db = getEnv().DB;
	const battle = await db
		.prepare(
			`SELECT b.id, b.title, b.status, b.rounds, b.creator_id, b.challenger_id, c.username AS creator, ch.username AS challenger
			 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id WHERE b.id = ?`
		)
		.bind(battleId)
		.first<{ id: string; title: string; status: string; rounds: number; creator_id: string; challenger_id: string | null; creator: string; challenger: string | null }>();
	if (!battle || battle.status === 'removed') error(404, 'Battle not found');
	const listing = await getOrCreateListing(db, battle.id, locals.user.id, round);
	if (!listing) error(403, 'Only the producers in this battle can sell their beat.');
	return { db, battle, listing, user: locals.user };
}

const roundOf = (url: URL) => Math.max(1, Math.min(5, Number(url.searchParams.get('round')) || 1));

const toCents = (v: FormDataEntryValue | null) => {
	const s = String(v ?? '').replace(/[$,\s]/g, '');
	if (!s) return null;
	const n = Math.round(Number(s) * 100);
	return Number.isFinite(n) && n > 0 ? n : NaN;
};

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { db, battle, listing } = await context(locals, params.id, url.pathname, roundOf(url));
	const settings = await storeSettings(db);
	const seller = await db
		.prepare('SELECT username, legal_name, seller_agreed_at, seller_agreement_version, payouts_enabled, listing_defaults FROM users WHERE id = ?')
		.bind(locals.user!.id)
		.first<{ username: string; legal_name: string | null; seller_agreed_at: number | null; seller_agreement_version: string | null; payouts_enabled: number; listing_defaults: string | null }>();
	// Answers from their last signed listing pre-fill a fresh one (they still review and sign it).
	const defaults = (() => {
		try {
			return seller?.listing_defaults ? (JSON.parse(seller.listing_defaults) as ListingDefaults) : null;
		} catch {
			return null;
		}
	})();
	const useDefaults = !!defaults && !listing.rights_schedule && !listing.producer_signed_at;
	const opponent = listing.seller_id === battle.creator_id ? battle.challenger : battle.creator;
	return {
		battle: { id: battle.id, title: battle.title, status: battle.status, opponent, buyOpen: buyOpen(battle.status), rounds: battle.rounds, round: roundOf(url) },
		listing: {
			id: listing.id,
			status: listing.status,
			priceCents: listing.price_cents,
			stemsPriceCents: listing.stems_price_cents,
			bpm: listing.bpm,
			musicKey: listing.music_key,
			genre: listing.genre,
			moods: listing.moods ? listing.moods.split(',') : [],
			rights: useDefaults ? defaults!.rights : parseRights(listing.rights_schedule),
			credit: listing.producer_credit ?? (useDefaults ? defaults!.credit : null) ?? seller?.username ?? '',
			entity: listing.producer_entity ?? (useDefaults ? defaults!.entity : '') ?? '',
			capacity: listing.producer_capacity ?? (useDefaults ? defaults!.capacity : 'self') ?? 'self',
			tagged: !!listing.tagged, // describes this file, so never carried over
			fromDefaults: useDefaults,
			version: listing.listing_version,
			signed:
				listing.producer_signed_at && listing.license_version === STORE_DOCS_VERSION
					? { name: listing.producer_signature!, at: listing.producer_signed_at, version: listing.listing_version }
					: null,
			staleSignature: !!listing.producer_signed_at && listing.license_version !== STORE_DOCS_VERSION,
			file: listing.file_key ? { name: listing.file_name!, size: listing.file_size!, format: listing.file_format } : null,
			stems: listing.stems_key ? { name: listing.stems_name!, size: listing.stems_size! } : null,
			missing: missingForListing(listing)
		},
		settings,
		seller: {
			agreed: !!seller?.seller_agreed_at && seller.seller_agreement_version === STORE_DOCS_VERSION,
			payoutsOn: !!seller?.payouts_enabled,
			legalName: seller?.legal_name ?? ''
		},
		options: { genres: GENRES, keys: KEYS, moods: MOODS },
		checklist: { account: SELLER_ACCOUNT_ITEMS, listing: LISTING_ITEMS, rightsLabels: RIGHTS_LABELS, licenseVersion: STORE_DOCS_VERSION }
	};
};

function locked(l: ListingRow) {
	return l.status === 'sold' || l.status === 'removed';
}

export const actions: Actions = {
	agree: async ({ request, locals, params, url }) => {
		const { db, user } = await context(locals, params.id, url.pathname, roundOf(url));
		const ticked = new Set((await request.formData()).getAll('item').map(String));
		if (SELLER_ACCOUNT_ITEMS.some((_, i) => !ticked.has(String(i)))) return fail(400, { agreeError: 'Tick every point to enable selling.' });
		await recordAcceptance(getEnv(), {
			kind: 'seller_account', userId: user.id, docVersion: STORE_DOCS_VERSION, request,
			statement: `Agree and enable selling:\n- ${SELLER_ACCOUNT_ITEMS.join('\n- ')}`
		});
		await db
			.prepare('UPDATE users SET seller_agreed_at = ?, seller_agreement_version = ? WHERE id = ?')
			.bind(Date.now(), STORE_DOCS_VERSION, user.id)
			.run();
		return { ok: 'Selling enabled. Now set up this beat.' };
	},

	save: async ({ request, locals, params, url }) => {
		const { db, listing, user } = await context(locals, params.id, url.pathname, roundOf(url));
		if (locked(listing)) return fail(400, { error: "This beat can't be changed anymore." });
		const agreed = await db.prepare('SELECT seller_agreement_version FROM users WHERE id = ?').bind(user.id).first<{ seller_agreement_version: string | null }>();
		if (agreed?.seller_agreement_version !== STORE_DOCS_VERSION) return fail(400, { error: 'Agree to the seller checklist first.' });
		const f = await request.formData();
		const price = toCents(f.get('price'));
		const stems = toCents(f.get('stems_price'));
		if (Number.isNaN(price) || Number.isNaN(stems)) return fail(400, { error: 'Prices must be dollar amounts, like 50 or 49.99.' });
		if (price && price > 10_000_000) return fail(400, { error: "That's over $100,000 — contact us if that's real." });
		if (stems && !price) return fail(400, { error: 'Set the exclusive price first.' });
		if (stems && price && stems <= price) return fail(400, { error: 'Exclusive + Stems has to cost more than the exclusive alone.' });
		const bpmRaw = String(f.get('bpm') ?? '').trim();
		const bpm = bpmRaw ? Math.round(Number(bpmRaw)) : null;
		if (bpm !== null && (!Number.isFinite(bpm) || bpm < 40 || bpm > 300)) return fail(400, { error: 'BPM should be between 40 and 300.' });
		const key = String(f.get('music_key') ?? '');
		const genre = String(f.get('genre') ?? '');
		const moods = f.getAll('moods').map(String).filter((m) => MOODS.includes(m)).slice(0, 3);
		const now = Date.now();
		const legalName = clean(f.get('legal_name'));
		const credit = clean(f.get('credit'), 60) || user.username;
		const forEntity = f.get('signing_as') === 'entity';
		const entity = forEntity ? clean(f.get('entity'), 120) : '';
		const capacity = forEntity ? clean(f.get('capacity'), 60) : 'self';
		if (forEntity && (entity.length < 2 || capacity.length < 2)) return fail(400, { error: 'Name the company and your role in it (e.g. Owner).' });
		// Rights schedule: every line answered, "none" included (License §5).
		const rights = {} as RightsSchedule;
		for (const k of RIGHT_KEYS) {
			const has = k === 'writers' ? true : f.get(`${k}_has`) === 'yes';
			const v = clean(f.get(k), 600);
			if (has && !v) return fail(400, { error: `Describe the ${RIGHTS_LABELS[k].toLowerCase()} (or choose none).` });
			rights[k] = has ? v : 'none';
		}
		const tagged = f.get('tagged') === 'on' ? 1 : 0;
		// Material terms of the offer. Any change needs a fresh signature (License §7).
		const material = (x: { price: number | null; stems: number | null; tagged: number; credit: string; entity: string; capacity: string; rights: string; file: string | null; stemsFile: string | null }) => JSON.stringify(x);
		const before = material({ price: listing.price_cents, stems: listing.stems_price_cents, tagged: listing.tagged, credit: listing.producer_credit ?? user.username, entity: listing.producer_entity ?? '', capacity: listing.producer_capacity ?? 'self', rights: listing.rights_schedule ?? '', file: listing.file_key, stemsFile: listing.stems_key });
		const after = material({ price, stems, tagged, credit, entity, capacity, rights: JSON.stringify(rights), file: listing.file_key, stemsFile: listing.stems_key });
		const changed = before !== after;
		// "Sign and list this beat" signs and publishes in one step.
		const wantsSign = f.get('go') === 'sign';
		const signName = clean(f.get('signature'));
		if (wantsSign) {
			const ticked = new Set(f.getAll('commit').map(String));
			if (LISTING_ITEMS.some((_, i) => !ticked.has(String(i)))) return fail(400, { error: 'Tick each commitment to sign the listing.' });
			if (legalName.length < 3) return fail(400, { error: 'Enter your full legal name to sign.' });
			if (signName.toLowerCase() !== legalName.toLowerCase()) return fail(400, { error: 'Type your full legal name exactly as above to sign.' });
			if (!price || !listing.file_key) return fail(400, { error: 'Add a price and the file buyers get before signing.' });
		} else if (listing.status === 'listed' && changed) {
			return fail(400, { error: 'Changing the price, files, credit or rights changes the signed offer. Tick the boxes and sign again to save it.' });
		}
		if (legalName) await db.prepare('UPDATE users SET legal_name = ? WHERE id = ?').bind(legalName, listing.seller_id).run();
		const stillSigned = !!listing.producer_signed_at && listing.license_version === STORE_DOCS_VERSION && !changed;

		let acceptanceId: string | null = stillSigned ? listing.producer_acceptance_id : null;
		let version = listing.listing_version;
		if (wantsSign) {
			version = listing.listing_version + 1;
			const { feePct } = await storeSettings(db);
			const snapshot = {
				beat_id: listing.id, entry_id: listing.entry_id, battle_id: listing.battle_id, listing_version: version, license_version: STORE_DOCS_VERSION,
				files: { file: listing.file_key ? { name: listing.file_name, size: listing.file_size, format: listing.file_format, tagged: !!tagged } : null, stems: listing.stems_key ? { name: listing.stems_name, size: listing.stems_size } : null },
				packages: { exclusive: price, exclusive_stems: stems },
				fee_pct: feePct, estimated_net: { exclusive: price ? splitSale(price, feePct).netCents : null, exclusive_stems: stems ? splitSale(stems, feePct).netCents : null },
				credit, rights_schedule: rights, preview: `entry:${listing.entry_id}`
			};
			const remember: ListingDefaults = { credit, entity, capacity, rights };
			await db.prepare('UPDATE users SET listing_defaults = ? WHERE id = ?').bind(JSON.stringify(remember), user.id).run();
			acceptanceId = await recordAcceptance(getEnv(), {
				kind: 'listing', userId: user.id, subjectId: listing.id, docVersion: STORE_DOCS_VERSION, signerName: signName, capacity, entity: entity || null, request, snapshot,
				statement: `Sign and list this beat (version ${version}):\n- ${LISTING_ITEMS.join('\n- ')}`
			});
		}
		await db
			.prepare(
				`UPDATE listings SET price_cents = ?, stems_price_cents = ?, bpm = ?, music_key = ?, genre = ?, moods = ?, tagged = ?, sample_disclosure = ?,
				   producer_credit = ?, producer_entity = ?, producer_capacity = ?, rights_schedule = ?, listing_version = ?, producer_acceptance_id = ?,
				   producer_signature = ?, producer_signed_at = ?, license_version = ?, attested_at = ?, updated_at = ? WHERE id = ?`
			)
			.bind(
				price, stems, bpm, KEYS.includes(key) ? key : null, GENRES.includes(genre) ? genre : null, moods.join(','), tagged, rights.samples,
				credit, entity || null, capacity, JSON.stringify(rights), version, acceptanceId,
				wantsSign ? signName : stillSigned ? listing.producer_signature : null,
				wantsSign ? now : stillSigned ? listing.producer_signed_at : null,
				wantsSign ? STORE_DOCS_VERSION : stillSigned ? listing.license_version : null,
				wantsSign ? now : stillSigned ? listing.attested_at : null,
				now, listing.id
			)
			.run();

		if (f.get('publish') === '1' || wantsSign) {
			const fresh = (await db.prepare('SELECT * FROM listings WHERE id = ?').bind(listing.id).first<ListingRow>())!;
			const missing = missingForListing(fresh);
			if (missing.length) return fail(400, { error: `Before it can go on sale, add ${missing.join(', ')}.` });
			await db.prepare(`UPDATE listings SET status = 'listed', updated_at = ? WHERE id = ?`).bind(now, listing.id).run();
			return { ok: 'Your beat is on sale. 🔥' };
		}
		return { ok: listing.status === 'listed' ? 'Listing updated.' : 'Saved as a draft.' };
	},

	unlist: async ({ locals, params, url }) => {
		const { db, listing } = await context(locals, params.id, url.pathname, roundOf(url));
		if (listing.status !== 'listed') return fail(400, { error: "It isn't on sale." });
		await db.prepare(`UPDATE listings SET status = 'unlisted', updated_at = ? WHERE id = ?`).bind(Date.now(), listing.id).run();
		return { ok: 'Taken off the store. You can put it back anytime.' };
	},

	removeStems: async ({ locals, params, url }) => {
		const { db, listing } = await context(locals, params.id, url.pathname, roundOf(url));
		if (locked(listing)) return fail(400, { error: "This beat can't be changed anymore." });
		if (listing.status === 'listed') return fail(400, { error: 'Take the beat off the store to change its files.' });
		if (listing.stems_key) await getEnv().AUDIO.delete(listing.stems_key);
		await db
			.prepare('UPDATE listings SET stems_key = NULL, stems_name = NULL, stems_size = NULL, stems_price_cents = NULL, producer_signed_at = NULL, updated_at = ? WHERE id = ?')
			.bind(Date.now(), listing.id)
			.run();
		return { ok: 'Stems removed. It now sells as the exclusive only.' };
	}
};
