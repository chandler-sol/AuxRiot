import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { STORE_DOCS_VERSION, buyOpen, getOrCreateListing, missingForListing, storeSettings, type ListingRow } from '#lib/server/store.ts';
import { GENRES, KEYS, MOODS } from '#lib/store.ts';

async function context(locals: App.Locals, battleId: string, path: string) {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(path)}`);
	const db = getEnv().DB;
	const battle = await db
		.prepare(
			`SELECT b.id, b.title, b.status, b.creator_id, b.challenger_id, c.username AS creator, ch.username AS challenger
			 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id WHERE b.id = ?`
		)
		.bind(battleId)
		.first<{ id: string; title: string; status: string; creator_id: string; challenger_id: string | null; creator: string; challenger: string | null }>();
	if (!battle || battle.status === 'removed') error(404, 'Battle not found');
	const listing = await getOrCreateListing(db, battle.id, locals.user.id);
	if (!listing) error(403, 'Only the producers in this battle can sell their beat.');
	return { db, battle, listing, user: locals.user };
}

const toCents = (v: FormDataEntryValue | null) => {
	const s = String(v ?? '').replace(/[$,\s]/g, '');
	if (!s) return null;
	const n = Math.round(Number(s) * 100);
	return Number.isFinite(n) && n > 0 ? n : NaN;
};

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { db, battle, listing } = await context(locals, params.id, url.pathname);
	const settings = await storeSettings(db);
	const seller = await db
		.prepare('SELECT legal_name, seller_agreed_at, seller_agreement_version FROM users WHERE id = ?')
		.bind(locals.user!.id)
		.first<{ legal_name: string | null; seller_agreed_at: number | null; seller_agreement_version: string | null }>();
	const opponent = listing.seller_id === battle.creator_id ? battle.challenger : battle.creator;
	return {
		battle: { id: battle.id, title: battle.title, status: battle.status, opponent, buyOpen: buyOpen(battle.status) },
		listing: {
			id: listing.id,
			status: listing.status,
			priceCents: listing.price_cents,
			stemsPriceCents: listing.stems_price_cents,
			bpm: listing.bpm,
			musicKey: listing.music_key,
			genre: listing.genre,
			moods: listing.moods ? listing.moods.split(',') : [],
			tagged: !!listing.tagged,
			sampleDisclosure: listing.sample_disclosure ?? '',
			signed: listing.producer_signed_at ? { name: listing.producer_signature!, at: listing.producer_signed_at } : null,
			file: listing.file_key ? { name: listing.file_name!, size: listing.file_size!, format: listing.file_format } : null,
			stems: listing.stems_key ? { name: listing.stems_name!, size: listing.stems_size! } : null,
			missing: missingForListing(listing)
		},
		settings,
		seller: {
			agreed: !!seller?.seller_agreed_at && seller.seller_agreement_version === STORE_DOCS_VERSION,
			legalName: seller?.legal_name ?? ''
		},
		options: { genres: GENRES, keys: KEYS, moods: MOODS }
	};
};

function locked(l: ListingRow) {
	return l.status === 'sold' || l.status === 'removed';
}

export const actions: Actions = {
	agree: async ({ request, locals, params, url }) => {
		const { db, user } = await context(locals, params.id, url.pathname);
		const ticked = (await request.formData()).getAll('item');
		if (ticked.length < 10) return fail(400, { agreeError: 'Tick every point to enable selling.' });
		await db
			.prepare('UPDATE users SET seller_agreed_at = ?, seller_agreement_version = ? WHERE id = ?')
			.bind(Date.now(), STORE_DOCS_VERSION, user.id)
			.run();
		return { ok: 'Selling enabled. Now set up this beat.' };
	},

	save: async ({ request, locals, params, url }) => {
		const { db, listing, user } = await context(locals, params.id, url.pathname);
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
		const disclosure = String(f.get('sample_disclosure') ?? '').trim().slice(0, 1000);
		const legalName = String(f.get('legal_name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
		const signName = String(f.get('signature') ?? '').trim().replace(/\s+/g, ' ');
		const wantsSign = f.get('sign') === 'on';
		if (wantsSign) {
			if (legalName.length < 3) return fail(400, { error: 'Enter your full legal name to sign.' });
			if (signName.toLowerCase() !== legalName.toLowerCase()) return fail(400, { error: 'Type your full legal name exactly as above to sign.' });
			if (!disclosure) return fail(400, { error: 'Fill in the sample disclosure before signing ("none" if there are no samples).' });
		}
		if (legalName) await db.prepare('UPDATE users SET legal_name = ? WHERE id = ?').bind(legalName, listing.seller_id).run();
		// Changing what's disclosed changes what was signed, so it needs a fresh signature.
		const disclosureChanged = (listing.sample_disclosure ?? '') !== disclosure;
		const keepSig = listing.producer_signed_at && !disclosureChanged;
		await db
			.prepare(
				`UPDATE listings SET price_cents = ?, stems_price_cents = ?, bpm = ?, music_key = ?, genre = ?, moods = ?, tagged = ?, sample_disclosure = ?,
				   producer_signature = ?, producer_signed_at = ?, license_version = ?, attested_at = ?, updated_at = ? WHERE id = ?`
			)
			.bind(
				price, stems, bpm, KEYS.includes(key) ? key : null, GENRES.includes(genre) ? genre : null, moods.join(','), f.get('tagged') === 'on' ? 1 : 0, disclosure || null,
				wantsSign ? signName : keepSig ? listing.producer_signature : null,
				wantsSign ? now : keepSig ? listing.producer_signed_at : null,
				wantsSign ? STORE_DOCS_VERSION : keepSig ? listing.license_version : null,
				wantsSign ? now : keepSig ? listing.attested_at : null,
				now, listing.id
			)
			.run();

		if (f.get('publish') === '1') {
			const fresh = (await db.prepare('SELECT * FROM listings WHERE id = ?').bind(listing.id).first<ListingRow>())!;
			const missing = missingForListing(fresh);
			if (missing.length) return fail(400, { error: `Before it can go on sale, add ${missing.join(', ')}.` });
			await db.prepare(`UPDATE listings SET status = 'listed', updated_at = ? WHERE id = ?`).bind(now, listing.id).run();
			return { ok: 'Your beat is on sale. 🔥' };
		}
		return { ok: listing.status === 'listed' ? 'Listing updated.' : 'Saved as a draft.' };
	},

	unlist: async ({ locals, params, url }) => {
		const { db, listing } = await context(locals, params.id, url.pathname);
		if (listing.status !== 'listed') return fail(400, { error: "It isn't on sale." });
		await db.prepare(`UPDATE listings SET status = 'unlisted', updated_at = ? WHERE id = ?`).bind(Date.now(), listing.id).run();
		return { ok: 'Taken off the store. You can put it back anytime.' };
	},

	removeStems: async ({ locals, params, url }) => {
		const { db, listing } = await context(locals, params.id, url.pathname);
		if (locked(listing)) return fail(400, { error: "This beat can't be changed anymore." });
		if (listing.stems_key) await getEnv().AUDIO.delete(listing.stems_key);
		await db
			.prepare('UPDATE listings SET stems_key = NULL, stems_name = NULL, stems_size = NULL, stems_price_cents = NULL, updated_at = ? WHERE id = ?')
			.bind(Date.now(), listing.id)
			.run();
		return { ok: 'Stems removed. It now sells as the exclusive only.' };
	}
};
