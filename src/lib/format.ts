export function timeLeft(ms: number): string {
	if (ms <= 0) return 'ending…';
	const m = Math.floor(ms / 60000);
	if (m < 60) return `${m}m left`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ${m % 60}m left`;
	return `${Math.floor(h / 24)}d ${h % 24}h left`;
}

/** Countdown for battle cards: "1d 22h left" until the last day, then a ticking "05:12:33 left". */
export function countdown(ms: number): string {
	if (ms <= 0) return 'Time — counting';
	const s = Math.floor(ms / 1000);
	if (s >= 86_400) return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h left`;
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)} left`;
}

export function ago(ts: number, now = Date.now()): string {
	const s = Math.max(0, Math.floor((now - ts) / 1000));
	if (s < 60) return 'just now';
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	return new Date(ts).toLocaleDateString();
}

export function clock(sec: number): string {
	if (!isFinite(sec) || sec < 0) sec = 0;
	const s = Math.floor(sec);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
