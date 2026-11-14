/** Public service card data (browse page, profiles). Samples stream like battle beats; nothing is downloadable. */
export interface ServiceSample {
	id: string;
	title: string;
	after: { src: string; peaks: number[]; durationMs: number };
	before: { src: string; peaks: number[]; durationMs: number } | null;
}

export interface ServiceCard {
	id: string;
	category: string;
	title: string;
	description: string;
	priceFromCents: number;
	turnaroundDays: number;
	revisions: number;
	status: string;
	provider: {
		id: string;
		username: string;
		avatarKey: string | null;
		color: string | null;
		respect: number;
		wins: number;
		losses: number;
		ties: number;
		judged: number;
		provider: boolean;
	};
	samples: ServiceSample[];
}

const PROVIDER_SELECT = `u.id AS uid, u.username, u.avatar_key, u.color, u.respect, u.wins, u.losses, u.ties, u.provider,
	(SELECT COUNT(*) FROM votes v JOIN battles vb ON vb.id = v.battle_id WHERE v.voter_id = u.id AND vb.status = 'closed' AND v.weight > 0) AS judged`;

type Row = {
	id: string; category: string; title: string; description: string; price_from_cents: number; turnaround_days: number; revisions: number; status: string;
	uid: string; username: string; avatar_key: string | null; color: string | null; respect: number; wins: number; losses: number; ties: number; provider: number; judged: number;
};

/** Load service cards matching a WHERE clause (on `s` services and `u` users), with their samples. */
export async function loadServices(db: D1Database, where: string, binds: unknown[], orderBy = 's.updated_at DESC', limit = 60): Promise<ServiceCard[]> {
	const rows = await db
		.prepare(`SELECT s.*, ${PROVIDER_SELECT} FROM services s JOIN users u ON u.id = s.user_id WHERE ${where} ORDER BY ${orderBy} LIMIT ${limit}`)
		.bind(...binds)
		.all<Row>();
	if (!rows.results.length) return [];
	const ids = rows.results.map((r) => r.id);
	const samples = await db
		.prepare(`SELECT * FROM service_samples WHERE service_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at ASC`)
		.bind(...ids)
		.all<{ id: string; service_id: string; title: string; audio_key: string; duration_ms: number; peaks: string; before_key: string | null; before_duration_ms: number | null; before_peaks: string | null }>();
	return rows.results.map((r) => ({
		id: r.id,
		category: r.category,
		title: r.title,
		description: r.description,
		priceFromCents: r.price_from_cents,
		turnaroundDays: r.turnaround_days,
		revisions: r.revisions,
		status: r.status,
		provider: {
			id: r.uid,
			username: r.username,
			avatarKey: r.avatar_key,
			color: r.color,
			respect: r.respect,
			wins: r.wins,
			losses: r.losses,
			ties: r.ties,
			judged: r.judged,
			provider: !!r.provider
		},
		samples: samples.results
			.filter((x) => x.service_id === r.id)
			.map((x) => ({
				id: x.id,
				title: x.title,
				after: { src: `/audio/${x.audio_key}`, peaks: JSON.parse(x.peaks) as number[], durationMs: x.duration_ms },
				before: x.before_key ? { src: `/audio/${x.before_key}`, peaks: JSON.parse(x.before_peaks!) as number[], durationMs: x.before_duration_ms! } : null
			}))
	}));
}
