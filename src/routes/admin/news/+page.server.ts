import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { sendEmail } from '#lib/server/email.ts';
import { UNSUBSCRIBE_PLACEHOLDER, newsReady, sendBroadcast, syncPending } from '#lib/server/news.ts';
import { renderNewsletter, TEMPLATES, type NewsDraft, type TemplateKey } from '#lib/newsletter.ts';
import { battleColors } from '#lib/colors.ts';

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) error(404);
	return locals.user;
}

const cap = (v: unknown, n: number) => String(v ?? '').slice(0, n);

/** Rebuild a draft from untrusted JSON: known fields only, every string length-capped. */
function cleanDraft(raw: string): NewsDraft | null {
	let d: Record<string, unknown>;
	try {
		d = JSON.parse(raw);
	} catch {
		return null;
	}
	const t = (d.template as TemplateKey) in TEMPLATES ? (d.template as TemplateKey) : 'announcement';
	const stats = Array.isArray(d.stats) ? d.stats.slice(0, 3) : [];
	const sections = Array.isArray(d.sections) ? d.sections.slice(0, 4) : [];
	const b = d.battle as Record<string, unknown> | null;
	return {
		template: t,
		subject: cap(d.subject, 150),
		preheader: cap(d.preheader, 150),
		kicker: cap(d.kicker, 40),
		label: cap(d.label, 60),
		headline1: cap(d.headline1, 60),
		headline2: cap(d.headline2, 60),
		intro: cap(d.intro, 600),
		imageUrl: cap(d.imageUrl, 300),
		showStats: !!d.showStats,
		stats: stats.map((s: { value?: unknown; label?: unknown }) => ({ value: cap(s?.value, 16), label: cap(s?.label, 24) })),
		battle: b
			? {
					status: cap(b.status, 60),
					a: cap(b.a, 30),
					b: cap(b.b, 30),
					colorA: cap(b.colorA, 7),
					colorB: cap(b.colorB, 7),
					title: cap(b.title, 100),
					url: cap(b.url, 200)
				}
			: null,
		sections: sections.map((s: { title?: unknown; body?: unknown }) => ({ title: cap(s?.title, 60), body: cap(s?.body, 2000) })),
		buttonText: cap(d.buttonText, 40),
		buttonUrl: cap(d.buttonUrl, 300),
		buttonPink: !!d.buttonPink,
		signature: cap(d.signature, 40)
	};
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals);
	const env = getEnv(platform);
	const counts = await env.DB.prepare(
		`SELECT
		   (SELECT COUNT(*) FROM users WHERE news_opt_in = 1 AND email_verified_at IS NOT NULL AND shadowbanned = 0) AS subscribers,
		   (SELECT COUNT(*) FROM users WHERE news_opt_in = 1 AND email_verified_at IS NOT NULL AND news_synced = 0) AS pending,
		   (SELECT COUNT(*) FROM users WHERE news_opt_in = 1 AND email_verified_at IS NULL) AS unverified`
	).first<{ subscribers: number; pending: number; unverified: number }>();

	const battles = await env.DB.prepare(
		`SELECT b.id, b.title, b.status, b.winner_id, b.creator_id, b.color_a, b.color_b, b.result_json,
		        c.username AS creator, ch.username AS challenger
		 FROM battles b JOIN users c ON c.id = b.creator_id JOIN users ch ON ch.id = b.challenger_id
		 WHERE b.status IN ('voting', 'closed') ORDER BY COALESCE(b.voting_ends_at, b.created_at) DESC LIMIT 40`
	).all<{
		id: string; title: string; status: string; winner_id: string | null; creator_id: string;
		color_a: string | null; color_b: string | null; result_json: string | null; creator: string; challenger: string;
	}>();

	const sends = await env.DB.prepare(
		`SELECT id, subject, template, recipients, created_at FROM news_sends ORDER BY created_at DESC LIMIT 10`
	).all<{ id: string; subject: string; template: string; recipients: number; created_at: number }>();

	return {
		ready: newsReady(env),
		counts: counts ?? { subscribers: 0, pending: 0, unverified: 0 },
		sends: sends.results,
		battles: battles.results.map((b) => {
			const [ca, cb] = battleColors(b.id, b.color_a, b.color_b);
			const r = b.result_json ? (JSON.parse(b.result_json) as { slots: { total: number }[] }) : null;
			const winner = b.winner_id === null ? null : b.winner_id === b.creator_id ? b.creator : b.challenger;
			return {
				id: b.id,
				label: `${b.creator} vs ${b.challenger} — ${b.title}`,
				battle: {
					status: b.status === 'voting' ? '● Live vote' : winner ? `■ Final — ${winner} wins` : '■ Final — tie',
					a: b.creator,
					b: b.challenger,
					colorA: ca,
					colorB: cb,
					title: r ? `${b.title} · ${r.slots[0].total.toFixed(1)} – ${r.slots[1].total.toFixed(1)}` : b.title,
					url: `https://auxriot.com/battles/${b.id}`
				}
			};
		}),
		templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, blurb: t.blurb }))
	};
};

export const actions: Actions = {
	image: async ({ request, locals, platform, url }) => {
		requireAdmin(locals);
		const file = (await request.formData()).get('image');
		if (!(file instanceof File) || file.size === 0) return fail(400, { imageError: 'Choose an image.' });
		if (file.size > 3 * 1024 * 1024) return fail(400, { imageError: 'Image is over 3 MB.' });
		const bytes = new Uint8Array(await file.arrayBuffer());
		const sig = String.fromCharCode(...bytes.slice(0, 12));
		const type =
			bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpg' : sig.startsWith('\x89PNG') ? 'png' : sig.startsWith('RIFF') && sig.slice(8) === 'WEBP' ? 'webp' : sig.startsWith('GIF8') ? 'gif' : '';
		if (!type) return fail(400, { imageError: 'Use JPEG, PNG, WebP or GIF.' });
		const name = `${newId(12)}.${type}`;
		await getEnv(platform).AUDIO.put(`news/${name}`, bytes, {
			httpMetadata: { contentType: type === 'jpg' ? 'image/jpeg' : `image/${type}`, cacheControl: 'public, max-age=31536000, immutable' }
		});
		const origin = url.hostname === 'localhost' ? url.origin : 'https://auxriot.com';
		return { imageUrl: `${origin}/media/news/${name}` };
	},

	test: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const env = getEnv(platform);
		const draft = cleanDraft(String((await request.formData()).get('draft') ?? ''));
		if (!draft || !draft.subject.trim()) return fail(400, { error: 'Add a subject first.' });
		const me = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(admin.id).first<{ email: string }>();
		const { html, text } = renderNewsletter(draft, {
			unsubscribeUrl: 'https://auxriot.com/settings/profile',
			preferencesUrl: 'https://auxriot.com/settings/profile'
		});
		const res = await sendEmail(env, { to: me!.email, subject: `[TEST] ${draft.subject}`, html, text, idempotencyKey: `newstest:${newId(8)}` });
		if (!res.ok) return fail(502, { error: `Test failed: ${res.error}` });
		return { ok: 'Test sent to your account email.' };
	},

	sync: async ({ locals, platform }) => {
		requireAdmin(locals);
		const r = await syncPending(getEnv(platform));
		if (r.pendingKey) return fail(400, { error: 'Marketing key not set up yet.' });
		return { ok: `Synced ${r.synced} subscriber${r.synced === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}.` };
	},

	send: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const env = getEnv(platform);
		const f = await request.formData();
		const draft = cleanDraft(String(f.get('draft') ?? ''));
		if (!draft || !draft.subject.trim() || !draft.headline1.trim()) return fail(400, { error: 'Add a subject and headline first.' });
		if (f.get('confirm') !== 'SEND') return fail(400, { error: 'Type SEND to confirm.' });
		if (!newsReady(env)) return fail(400, { error: 'Marketing key not set up yet.' });

		await syncPending(env); // make sure everyone who opted in is in the segment
		const counts = await env.DB.prepare(
			'SELECT COUNT(*) AS n FROM users WHERE news_opt_in = 1 AND news_synced = 1 AND shadowbanned = 0'
		).first<{ n: number }>();
		const { html, text } = renderNewsletter(draft, { unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER, preferencesUrl: 'https://auxriot.com/settings/profile' });
		const res = await sendBroadcast(env, { name: `${draft.template} — ${draft.subject}`.slice(0, 120), subject: draft.subject, html, text });
		if (!res.ok) return fail(502, { error: res.error });
		await env.DB.prepare(
			'INSERT INTO news_sends (id, resend_broadcast_id, template, subject, draft_json, sent_by, recipients, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
			.bind(newId(), res.id, draft.template, draft.subject, JSON.stringify(draft), admin.id, counts?.n ?? 0, Date.now())
			.run();
		return { ok: `Sent to ${counts?.n ?? 0} subscriber${counts?.n === 1 ? '' : 's'}. Resend is delivering it now.` };
	}
};
