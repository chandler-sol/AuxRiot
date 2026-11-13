import { sha256 } from './util.ts';

/**
 * Password gate for beta.auxriot.com. Every request (pages, form posts, audio)
 * needs a cookie proving the shared BETA_PASSWORD was entered. If the secret
 * isn't set yet, the beta stays locked. Production never runs this.
 */
const COOKIE = 'beta_ok';
const PATH = '/__beta';

async function proof(password: string, salt: string) {
	return sha256(`${salt}:beta:${password}`);
}

function page(error = '') {
	return new Response(
		`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>AuxRiot beta</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0d0b;color:#ede6d6;font-family:system-ui,sans-serif}
form{display:grid;gap:12px;width:min(340px,88vw)}h1{font-family:Impact,'Arial Narrow Bold',sans-serif;font-size:3rem;margin:0;letter-spacing:.02em}h1 span{color:#ff3d7f}
input,button{font:inherit;padding:14px;border-radius:2px;border:1.5px solid #3a352e;background:#16140f;color:#ede6d6}button{background:#ede6d6;color:#0e0d0b;font-weight:700;cursor:pointer}
p{margin:0;color:#8a8274;font-size:.9rem}.e{color:#ff5a4e}</style></head><body>
<form method="POST" action="${PATH}"><h1>AUX<span>RIOT</span> beta</h1><p>Prototype site. Nothing here is real.</p>
${error ? `<p class="e">${error}</p>` : ''}<input type="password" name="password" placeholder="Beta password" autofocus required><button>Enter</button></form></body></html>`,
		{ status: error ? 401 : 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' } }
	);
}

/** Returns a Response to send instead of the page, or null to let the request through. */
export async function betaGate(request: Request, url: URL, cookies: import('@sveltejs/kit').Cookies, env: Env): Promise<Response | null> {
	if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
	// Trim: a stray space pasted into the dashboard shouldn't lock people out.
	const secret = env.BETA_PASSWORD?.trim();
	const salt = env.SIGNAL_SALT ?? 'dev-salt';
	if (!secret) return page('Beta is locked until its password is set.');

	if (url.pathname === PATH && request.method === 'POST') {
		const pw = String((await request.formData()).get('password') ?? '').trim();
		if (pw !== secret) return page('Wrong password.');
		cookies.set(COOKIE, await proof(secret, salt), { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 30 });
		return new Response(null, { status: 303, headers: { location: '/' } });
	}
	if (cookies.get(COOKIE) === (await proof(secret, salt))) return null;
	return page();
}
