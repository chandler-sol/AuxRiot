import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';

export const actions: Actions = {
	default: async ({ request, platform }) => {
		const f = await request.formData();
		const get = (k: string) => String(f.get(k) ?? '').trim();
		const url = get('battle_url');
		const battleId = url.match(/battles\/([A-Za-z0-9_-]+)/)?.[1] ?? url;
		const slotRaw = get('slot');
		const values = {
			battle_url: url,
			claimant_name: get('claimant_name'),
			claimant_email: get('claimant_email'),
			work_description: get('work_description'),
			signature: get('signature')
		};

		if (!battleId || !values.claimant_name || !values.claimant_email || !values.work_description || !values.signature) {
			return fail(400, { ...values, error: 'Please fill in every field.' });
		}
		if (f.get('good_faith') !== 'on' || f.get('accuracy') !== 'on') {
			return fail(400, { ...values, error: 'Both statements are required for a valid notice.' });
		}
		const db = getEnv(platform).DB;
		const exists = await db.prepare('SELECT 1 FROM battles WHERE id = ?').bind(battleId).first();
		if (!exists) return fail(400, { ...values, error: "We couldn't find that battle. Paste the full battle URL." });

		await db
			.prepare(
				`INSERT INTO dmca_requests (id, battle_id, slot, claimant_name, claimant_email, work_description, good_faith, accuracy, signature, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
			)
			.bind(
				newId(),
				battleId,
				slotRaw === '0' || slotRaw === '1' ? Number(slotRaw) : null,
				values.claimant_name.slice(0, 200),
				values.claimant_email.slice(0, 254),
				values.work_description.slice(0, 4000),
				values.signature.slice(0, 200),
				Date.now()
			)
			.run();
		return { sent: true };
	}
};
