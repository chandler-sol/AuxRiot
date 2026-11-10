import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { BIO_MAX, normalizeSocial, parseSocials, storeAvatar } from '#lib/server/profile.ts';
import { SOCIALS } from '#lib/socials.ts';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const row = await getEnv(platform)
		.DB.prepare('SELECT username, avatar_key, bio, socials FROM users WHERE id = ?')
		.bind(locals.user.id)
		.first<{ username: string; avatar_key: string | null; bio: string; socials: string }>();
	return {
		username: row!.username,
		avatarKey: row!.avatar_key,
		bio: row!.bio,
		socials: parseSocials(row!.socials),
		bioMax: BIO_MAX
	};
};

export const actions: Actions = {
	save: async ({ request, locals, platform }) => {
		if (!locals.user) return fail(401);
		const f = await request.formData();
		const bio = String(f.get('bio') ?? '').trim().replace(/\s+\n/g, '\n');
		const raw: Record<string, string> = {};
		for (const s of SOCIALS) raw[s.key] = String(f.get(s.key) ?? '');
		if (bio.length > BIO_MAX) return fail(400, { error: `Bio must be ${BIO_MAX} characters or fewer.`, bio, raw });

		const socials: Record<string, string> = {};
		for (const s of SOCIALS) {
			const r = normalizeSocial(s.key, raw[s.key]);
			if (r && typeof r === 'object') return fail(400, { error: r.error, bio, raw });
			if (r) socials[s.key] = r;
		}
		await getEnv(platform)
			.DB.prepare('UPDATE users SET bio = ?, socials = ? WHERE id = ?')
			.bind(bio, JSON.stringify(socials), locals.user.id)
			.run();
		return { saved: true };
	},

	avatar: async ({ request, locals, platform }) => {
		if (!locals.user) return fail(401);
		const env = getEnv(platform);
		const file = (await request.formData()).get('avatar');
		if (!(file instanceof File)) return fail(400, { avatarError: 'Choose an image.' });
		const key = await storeAvatar(env.AUDIO, file);
		if (typeof key === 'object') return fail(400, { avatarError: key.error });
		const old = await env.DB.prepare('SELECT avatar_key FROM users WHERE id = ?').bind(locals.user.id).first<{ avatar_key: string | null }>();
		await env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, locals.user.id).run();
		if (old?.avatar_key) await env.AUDIO.delete(old.avatar_key);
		return { avatarSaved: true };
	},

	removeAvatar: async ({ locals, platform }) => {
		if (!locals.user) return fail(401);
		const env = getEnv(platform);
		const old = await env.DB.prepare('SELECT avatar_key FROM users WHERE id = ?').bind(locals.user.id).first<{ avatar_key: string | null }>();
		await env.DB.prepare('UPDATE users SET avatar_key = NULL WHERE id = ?').bind(locals.user.id).run();
		if (old?.avatar_key) await env.AUDIO.delete(old.avatar_key);
		return { avatarRemoved: true };
	}
};
