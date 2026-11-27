import type { Cookies } from '@sveltejs/kit';

/**
 * Privacy Policy §5: the device ID always helps prevent fraud, but using it to count views
 * needs permission where the law requires it (EU/EEA, UK, Switzerland). There, view counting
 * stays off until the visitor agrees, and they can withdraw any time on /cookies.
 */
const CONSENT_COUNTRIES = new Set([
	'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
	'IS', 'LI', 'NO', // EEA
	'GB', 'CH'
]);
export const VIEW_CONSENT_COOKIE = 'view_consent';

export const countryOf = (request: Request) => (request as Request & { cf?: { country?: string } }).cf?.country ?? null;
export const consentRequired = (country: string | null) => !!country && CONSENT_COUNTRIES.has(country);

/** May we use the device ID to count a view for this visitor? */
export function mayCountViews(request: Request, cookies: Cookies) {
	return !consentRequired(countryOf(request)) || cookies.get(VIEW_CONSENT_COOKIE) === 'yes';
}
