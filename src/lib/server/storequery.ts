import { buyOpen } from './store.ts';

/** Public listing card data (store page and storefronts). Never includes private file keys. */
export interface StoreItem {
	id: string;
	battleId: string;
	title: string;
	seller: { username: string; avatarKey: string | null; color: string | null };
	status: string;
	priceCents: number;
	stemsPriceCents: number | null;
	hasStems: boolean;
	bpm: number | null;
	musicKey: string | null;
	genre: string | null;
	moods: string[];
	format: string | null;
	tagged: boolean;
	battleStatus: string;
	buyOpen: boolean;
	won: boolean | null;
	preview: { src: string; peaks: number[]; durationMs: number };
	color: string;
	soldAt: number | null;
	sellerId: string;
	/** Producer finished Stripe onboarding (checkout needs it). */
	sellerPayouts: boolean;
	/** Someone is mid-checkout on this exclusive until then. */
	heldUntil: number | null;
	heldBy: string | null;
	round: number;
	rounds: number;
	/** Filled in by withBuy() for the viewer. */
	buy?: BuyState;
}

/** Can this viewer buy it right now? Used to decide between a Buy button and a status chip. */
export function buyState(item: StoreItem, checkoutLive: boolean, viewerId: string | null): BuyState {
	if (item.status === 'sold') return 'sold';
	if (!item.buyOpen) return 'after';
	if (viewerId && viewerId === item.sellerId) return 'mine';
	if (!checkoutLive) return 'soon';
	if (!item.sellerPayouts) return 'unavailable';
	if (item.heldUntil && item.heldBy !== viewerId) return 'held';
	return 'buy';
}
export type BuyState = 'sold' | 'after' | 'mine' | 'soon' | 'unavailable' | 'held' | 'buy';

export const withBuy = (items: StoreItem[], live: boolean, viewerId: string | null) => items.map((i) => ({ ...i, buy: buyState(i, live, viewerId) as BuyState }));

export const ITEM_SELECT = `
	SELECT l.id, l.battle_id, l.status, l.price_cents, l.stems_price_cents, l.stems_key IS NOT NULL AS has_stems, l.bpm, l.music_key, l.genre,
	       l.moods, l.file_format, l.tagged, l.sold_at, l.created_at, l.seller_id,
	       b.title, b.status AS battle_status, b.winner_id, b.creator_id, b.color_a, b.color_b,
	       u.username, u.avatar_key, u.color, u.payouts_enabled AS seller_payouts, l.held_until, l.held_by,
	       e.audio_key, e.peaks, e.duration_ms, e.slot, e.round, b.rounds
	FROM listings l
	JOIN battles b ON b.id = l.battle_id
	JOIN users u ON u.id = l.seller_id
	JOIN entries e ON e.id = l.entry_id`;

type Row = {
	id: string; battle_id: string; status: string; price_cents: number; stems_price_cents: number | null; has_stems: number; bpm: number | null;
	music_key: string | null; genre: string | null; moods: string; file_format: string | null; tagged: number; sold_at: number | null; created_at: number;
	seller_id: string; title: string; battle_status: string; winner_id: string | null; creator_id: string; color_a: string | null; color_b: string | null;
	username: string; avatar_key: string | null; color: string | null; audio_key: string; peaks: string; duration_ms: number; slot: number;
	seller_payouts: number; held_until: number | null; held_by: string | null; round: number; rounds: number;
};

export function toItem(r: Row): StoreItem {
	return {
		id: r.id,
		battleId: r.battle_id,
		title: r.title,
		seller: { username: r.username, avatarKey: r.avatar_key, color: r.color },
		status: r.status,
		priceCents: r.price_cents,
		stemsPriceCents: r.has_stems ? r.stems_price_cents : null,
		hasStems: !!r.has_stems && !!r.stems_price_cents,
		bpm: r.bpm,
		musicKey: r.music_key,
		genre: r.genre,
		moods: r.moods ? r.moods.split(',') : [],
		format: r.file_format,
		tagged: !!r.tagged,
		battleStatus: r.battle_status,
		buyOpen: buyOpen(r.battle_status),
		won: r.battle_status === 'closed' ? r.winner_id === r.seller_id : null,
		preview: { src: `/audio/${r.audio_key}`, peaks: JSON.parse(r.peaks) as number[], durationMs: r.duration_ms },
		color: (r.slot === 0 ? r.color_a : r.color_b) ?? '#ff3d7f',
		soldAt: r.sold_at,
		sellerId: r.seller_id,
		sellerPayouts: !!r.seller_payouts,
		heldUntil: r.held_until && r.held_until > Date.now() ? r.held_until : null,
		heldBy: r.held_by,
		round: r.round,
		rounds: r.rounds
	};
}

export type { Row as ItemRow };
