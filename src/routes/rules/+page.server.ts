import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { describeHours, getVoterMinAgeHours } from '#lib/server/settings.ts';

export const load: PageServerLoad = async ({ platform }) => {
	const env = getEnv(platform);
	return { voterWait: describeHours(await getVoterMinAgeHours(env.DB, env)) };
};
