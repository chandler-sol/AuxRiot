import { defineConfig, devices } from '@playwright/test';

/**
 * AuxRiot's test robot. Runs the whole site locally (wrangler dev, beta config,
 * local D1/R2) and clicks through it like a person. See tests/e2e/README.md.
 *
 *   npm run test:e2e          build, migrate the local DB, run everything
 *   npx playwright test store run one file (server must be buildable)
 */
const PORT = Number(process.env.E2E_PORT ?? 8788);

export default defineConfig({
	testDir: 'tests/e2e',
	// One worker: the tests share one local database and a signup rate limit.
	workers: 1,
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	timeout: 240_000,
	expect: { timeout: 15_000 },
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: `http://localhost:${PORT}`,
		...devices['iPhone 13'],
		// Real Chromium for audio decoding/encoding in the uploader.
		browserName: 'chromium',
		trace: 'off',
		screenshot: 'only-on-failure',
		video: 'off',
		actionTimeout: 30_000,
		navigationTimeout: 45_000
	},
	webServer: {
		command: `npx wrangler dev --env beta --port ${PORT}`,
		url: `http://localhost:${PORT}/robots.txt`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: 'ignore',
		stderr: 'pipe'
	}
});
