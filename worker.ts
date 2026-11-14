/**
 * Worker entry: SvelteKit's handler for requests, plus a cron (see wrangler.jsonc)
 * for time-based jobs that shouldn't wait for someone to load a page.
 * Lives outside src/ so svelte-check skips the built bundle it imports.
 */
import sk from './.svelte-kit/cloudflare/_worker.js';
import { finalizeDue } from '#lib/server/battles.ts';
import { remindUnfinishedBallots } from '#lib/server/notify.ts';

type Handler = { fetch: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response> };

export default {
	fetch: (req: Request, env: Env, ctx: ExecutionContext) => (sk as unknown as Handler).fetch(req, env, ctx),
	async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			(async () => {
				// Close anything due first, so reminders never go to a battle that just ended.
				await finalizeDue(env.DB, Number(env.OPEN_BATTLE_EXPIRY_DAYS) || 5).catch((e) => console.error('[cron] finalize', e));
				await remindUnfinishedBallots(env.DB).catch((e) => console.error('[cron] remind', e));
			})()
		);
	}
} satisfies ExportedHandler<Env>;
