// Minimal typing for the Workers runtime module; full Env shape lives in app.d.ts.
declare module 'cloudflare:workers' {
	export const env: unknown;
}
