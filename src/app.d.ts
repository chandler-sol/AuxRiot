// See https://svelte.dev/docs/kit/types#app.d.ts
import type { D1Database, R2Bucket, ExecutionContext } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			deviceId: string;
			ip: string;
		}
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
		}
	}

	interface Env {
		DB: D1Database;
		AUDIO: R2Bucket;
		MIN_VOTER_ACCOUNT_AGE_HOURS: string;
		OPEN_BATTLE_EXPIRY_DAYS: string;
		ADMIN_USERNAMES: string;
		TURNSTILE_SITE_KEY: string;
		TURNSTILE_SECRET?: string;
		SIGNAL_SALT?: string;
		RESEND_API_KEY?: string;
	}

	interface SessionUser {
		id: string;
		username: string;
		isAdmin: boolean;
		shadowbanned: boolean;
		createdAt: number;
		emailVerified: boolean;
	}

	type D1Database = import('@cloudflare/workers-types').D1Database;
	type R2Bucket = import('@cloudflare/workers-types').R2Bucket;
}

export {};
