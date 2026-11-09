<script lang="ts" module>
	// Only one beat plays at a time across the page.
	let current: HTMLAudioElement | null = null;
	function claim(el: HTMLAudioElement) {
		if (current && current !== el) current.pause();
		current = el;
	}
</script>

<script lang="ts">
	import { clock } from '#lib/format.ts';

	interface Props {
		src: string;
		peaks: number[];
		durationMs: number;
		label?: string;
		accent?: string;
		/** When set, listening progress is reported to the server for the 75% rule. */
		entryId?: string;
		listenedMs?: number;
		threshold?: number;
	}
	let {
		src,
		peaks,
		durationMs,
		label = '',
		accent = 'var(--accent)',
		entryId,
		listenedMs = $bindable(0),
		threshold = 0.75
	}: Props = $props();

	let audio: HTMLAudioElement;
	let playing = $state(false);
	let loading = $state(false);
	let time = $state(0);
	let duration = $derived(durationMs / 1000);
	let progress = $derived(duration ? Math.min(1, time / duration) : 0);

	// Listen tracking: unique whole seconds actually played at 1x speed.
	const played = new Set<number>();
	let lastTime = 0;
	let lastReported = -1;
	let started = false;
	let localMs = $state(0);
	let shownMs = $derived(Math.max(listenedMs, localMs));
	let pct = $derived(durationMs ? Math.min(100, Math.round((shownMs / durationMs) * 100)) : 0);
	let unlocked = $derived(pct >= threshold * 100);

	function report(beacon = false) {
		if (!entryId) return;
		const playedMs = played.size * 1000;
		if (playedMs === lastReported && started) return;
		lastReported = playedMs;
		const body = JSON.stringify({ entryId, playedMs });
		if (beacon && navigator.sendBeacon) {
			navigator.sendBeacon('/api/listen', new Blob([body], { type: 'application/json' }));
			return;
		}
		fetch('/api/listen', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
			.then((r) => (r.ok ? r.json() : null))
			.then((d: { listenedMs: number } | null) => {
				if (d && d.listenedMs > listenedMs) listenedMs = d.listenedMs;
			})
			.catch(() => {});
	}

	function onTime() {
		time = audio.currentTime;
		if (!entryId || audio.paused || audio.seeking || audio.playbackRate !== 1) {
			lastTime = time;
			return;
		}
		const delta = time - lastTime;
		if (delta > 0 && delta < 1.5) {
			for (let s = Math.floor(lastTime); s <= Math.floor(time); s++) played.add(s);
			localMs = Math.min(durationMs, played.size * 1000);
			if (played.size * 1000 - lastReported >= 8000) report();
		}
		lastTime = time;
	}

	function toggle() {
		if (audio.paused) {
			claim(audio);
			audio.playbackRate = 1;
			loading = true;
			audio.play().catch(() => (loading = false));
		} else {
			audio.pause();
		}
	}

	function onPlay() {
		playing = true;
		lastTime = audio.currentTime;
		if (!started) {
			started = true;
			report(); // starts the server-side wall clock
		}
	}

	function onPause() {
		playing = false;
		report();
	}

	function seekFrom(e: PointerEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		audio.currentTime = x * duration;
		time = audio.currentTime;
		lastTime = time;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') audio.currentTime = Math.min(duration, audio.currentTime + 5);
		else if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
		else return;
		lastTime = audio.currentTime;
		e.preventDefault();
	}

	function onHide() {
		if (document.visibilityState === 'hidden') report(true);
	}

	$effect(() => {
		document.addEventListener('visibilitychange', onHide);
		return () => {
			document.removeEventListener('visibilitychange', onHide);
			if (audio && !audio.paused) audio.pause();
		};
	});
</script>

<div class="player" style:--c={accent}>
	<button class="play" onclick={toggle} aria-label={playing ? `Pause ${label}` : `Play ${label}`}>
		{#if loading && !playing}
			<span class="spinner"></span>
		{:else if playing}
			<svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
		{:else}
			<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
		{/if}
	</button>

	<div class="body">
		<div
			class="wave"
			role="slider"
			tabindex="0"
			aria-label="Seek {label}"
			aria-valuemin={0}
			aria-valuemax={Math.round(duration)}
			aria-valuenow={Math.round(time)}
			onpointerdown={seekFrom}
			onkeydown={onKey}
		>
			<svg viewBox="0 0 {peaks.length} 100" preserveAspectRatio="none" aria-hidden="true">
				{#each peaks as p, i (i)}
					{@const h = Math.max(6, (p / 255) * 100)}
					<rect x={i + 0.15} y={(100 - h) / 2} width="0.7" height={h} class:done={i / peaks.length < progress} />
				{/each}
			</svg>
		</div>
		<div class="meta row spread small">
			<span class="muted">{clock(time)} / {clock(duration)}</span>
			{#if entryId}
				<span class:ok={unlocked} class="listened">
					{unlocked ? '✓ ' : ''}{pct}% heard{unlocked ? '' : ` · ${Math.round(threshold * 100)}% to vote`}
				</span>
			{/if}
		</div>
	</div>

	<audio
		bind:this={audio}
		{src}
		preload="metadata"
		ontimeupdate={onTime}
		onplay={onPlay}
		onplaying={() => (loading = false)}
		onpause={onPause}
		onended={onPause}
		onratechange={() => {
			if (audio.playbackRate !== 1) audio.playbackRate = 1;
		}}
	></audio>
</div>

<style>
	.player { display: flex; gap: 12px; align-items: center; }
	.play {
		flex: none; width: 52px; height: 52px; padding: 0; border-radius: 50%;
		background: var(--c); border-color: var(--c); color: #fff;
	}
	.play:hover { background: var(--c); filter: brightness(1.1); }
	.play svg { fill: currentColor; }
	.body { flex: 1; min-width: 0; }
	.wave { height: 56px; cursor: pointer; touch-action: none; user-select: none; border-radius: 6px; }
	.wave svg { display: block; width: 100%; height: 100%; }
	.wave:focus-visible { outline: 2px solid var(--accent-2); }
	.wave rect { fill: #3a3a46; transition: fill 0.1s; }
	.wave rect.done { fill: var(--c); }
	.meta { margin-top: 2px; }
	.listened { color: var(--warn); font-weight: 600; }
	.listened.ok { color: var(--good); }
	.spinner {
		width: 20px; height: 20px; border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.35); border-top-color: #fff;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
