import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { unsubscribeToken } from '#lib/server/notify.ts';

async function valid(url: URL) {
	const u = url.searchParams.get('u') ?? '';
	const t = url.searchParams.get('t') ?? '';
	return u && t && t === (await unsubscribeToken(u)) ? u : null;
}

async function turnOff(platform: App.Platform | undefined, userId: string) {
	await getEnv(platform).DB.prepare('UPDATE users SET notify_battles = 0 WHERE id = ?').bind(userId).run();
}

export const load: PageServerLoad = async ({ url }) => ({ ok: !!(await valid(url)) });

export const actions: Actions = {
	// Mail apps' one-click unsubscribe POSTs here (List-Unsubscribe-Post), as does the button.
	default: async ({ url, platform }) => {
		const u = await valid(url);
		if (!u) return { done: false };
		await turnOff(platform, u);
		return { done: true };
	}
};
