import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { notify } from '#lib/server/notifications.ts';
import { sendEmail, layout } from '#lib/server/email.ts';
import { overLimit, recordAttempt } from '#lib/server/ratelimit.ts';

const HOURS_48 = 48 * 3_600_000;

/**
 * Terms of Service §7A: anyone (no account needed) can ask us to remove an intimate image
 * shared without consent. We act within 48 hours of a valid request. Never ask for the image.
 */
export const actions: Actions = {
	default: async ({ request, locals }) => {
		const env = getEnv();
		const f = await request.formData();
		const get = (k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max);
		const values = { location: get('location', 1000), details: get('details', 3000), signature: get('signature', 200), contact: get('contact', 300) };
		if (!values.location || !values.details || !values.signature || !values.contact) return fail(400, { ...values, error: 'Please fill in every field.' });
		if (f.get('good_faith') !== 'on') return fail(400, { ...values, error: 'The good-faith statement is required.' });
		const salt = env.SIGNAL_SALT ?? 'dev-salt';
		const limited = await overLimit(env.DB, locals.ip, salt, 'report');
		if (limited) return fail(429, { ...values, error: limited });
		await recordAttempt(env.DB, locals.ip, salt, 'report');
		const now = Date.now();
		const id = newId();
		await env.DB.prepare(
			`INSERT INTO removal_requests (id, location, details, signature, contact, on_behalf, user_id, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(id, values.location, values.details, values.signature, values.contact, f.get('on_behalf') === 'on' ? 1 : 0, locals.user?.id ?? null, now + HOURS_48, now)
			.run();
		// Every admin hears about it right away, in the app and by email: the 48-hour clock is running.
		const admins = await env.DB.prepare('SELECT id, email FROM users WHERE is_admin = 1').all<{ id: string; email: string }>();
		for (const a of admins.results) {
			await notify(env.DB, { userId: a.id, kind: 'report_actioned', text: 'URGENT: private image removal request. Act within 48 hours.', url: '/admin/removals' }).catch(() => {});
			await sendEmail(env, {
				to: a.email,
				idempotencyKey: `ncii:${id}:${a.id}`,
				subject: 'URGENT: private image removal request (48-hour deadline)',
				html: layout({ kicker: 'Safety', headline: 'Private image removal request', body: '<p>Someone asked us to remove an intimate image shared without consent. The Terms promise removal within 48 hours of a valid request, including known identical copies.</p>', button: 'Open the request', url: 'https://auxriot.com/admin/removals', footer: 'Terms of Service §7A' }),
				text: 'Private image removal request. Act within 48 hours: https://auxriot.com/admin/removals'
			}).catch(() => {});
		}
		return { sent: true };
	}
};
