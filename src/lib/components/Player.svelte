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
		/** Battler name shown in the header (full) or row (compact). */
		name?: string;
		corner?: string;
		/** full = poster player, compact = one-line replay row, bare = transport only. */
		variant?: 'full' | 'compact' | 'bare';
		tag?: string;
		/** Teaser mode: playback stops after this many seconds and seeking is limited to it. */
		previewSeconds?: number;
	}
	let {
		src,
		peaks,
		durationMs,
		label = '',
		accent = 'var(--a)',
		entryId,
		listenedMs = $bindable(0),
		threshold = 0.75,
		name = '',
		corner = '',
		variant = 'bare',
		tag = '',
		previewSeconds
	}: Props = $props();

	let audio: HTMLAudioElement;
	let playing = $state(false);
	let loading = $state(false);
	let time = $state(0);
	let fullDuration = $derived(durationMs / 1000);
	let duration = $derived(previewSeconds ? Math.min(previewSeconds, fullDuration) : fullDuration);
	let shownPeaks = $derived(
		previewSeconds && fullDuration > duration ? peaks.slice(0, Math.max(8, Math.ceil(peaks.length * (duration / fullDuration)))) : peaks
	);
	let previewDone = $state(false);
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
		if (previewSeconds && audio.currentTime >= duration) {
			audio.pause();
			audio.currentTime = 0;
			time = 0;
			previewDone = true;
			return;
		}
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
			previewDone = false;
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
		const x = Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width));
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

{#snippet playButton(size: number)}
	<button class="play" style:width="{size}px" style:height="{size}px" onclick={toggle} aria-label={playing ? `Pause ${label || name}` : `Play ${label || name}`}>
		{#if loading && !playing}
			<span class="spinner"></span>
		{:else if playing}
			<svg viewBox="0 0 24 24" width={size * 0.4} height={size * 0.4}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
		{:else}
			<svg viewBox="0 0 24 24" width={size * 0.4} height={size * 0.4}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
		{/if}
	</button>
{/snippet}

<div class="player {variant}" style:--c={accent}>
	{#if variant === 'compact'}
		{@render playButton(38)}
		<span class="cname display">{name}</span>
		<span class="mono ctag">{tag ? `${tag} · ` : ''}{playing || time > 0 ? `${clock(time)} / ` : ''}{clock(duration)}</span>
	{:else}
		{#if variant === 'full'}
			<div class="head">
				<span class="pname display">{name}</span>
				{#if corner}<span class="mono corner">{corner}</span>{/if}
			</div>
		{/if}
		<div class="transport">
			{@render playButton(56)}
			<div
				class="wave"
				role="slider"
				tabindex="0"
				aria-label="Seek {label || name}"
				aria-valuemin={0}
				aria-valuemax={Math.round(duration)}
				aria-valuenow={Math.round(time)}
				onpointerdown={seekFrom}
				onkeydown={onKey}
			>
				<svg viewBox="0 0 {shownPeaks.length} 100" preserveAspectRatio="none" aria-hidden="true">
					{#each shownPeaks as p, i (i)}
						{@const h = Math.max(8, (p / 255) * 100)}
						<rect x={i + 0.2} y={(100 - h) / 2} width="0.6" height={h} class:done={i / shownPeaks.length < progress} />
					{/each}
				</svg>
			</div>
		</div>
		<div class="meta">
			<span class="mono time">{clock(time)} / {clock(duration)}</span>
			{#if previewSeconds}<span class="mono heard">{previewDone ? 'Preview over — hear the rest inside' : `${Math.round(duration)}s preview`}</span>{/if}
			{#if entryId}<span class="mono heard">Heard {pct}%</span>{/if}
		</div>
		{#if entryId}
			<div class="meter" aria-hidden="true">
				<span class="fill" style:width="{pct}%"></span>
				<span class="gate" style:left="{threshold * 100}%"></span>
			</div>
			<span class="mono gatecopy" class:ok={unlocked}>
				{unlocked ? 'Cleared to score' : `Vote unlocks at ${Math.round(threshold * 100)}% — ${Math.round(threshold * 100) - pct}% to go`}
			</span>
		{/if}
	{/if}


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
	.player { --c: var(--a); }
	.full {
		display: flex; flex-direction: column; gap: 12px;
		background: var(--ink-2); border-left: 6px solid var(--c); border-radius: var(--radius);
		padding: 16px;
	}
	.bare { display: flex; flex-direction: column; gap: 8px; }
	.head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
	.pname { font-size: 2.1rem; color: var(--c); overflow-wrap: anywhere; }
	.corner { color: var(--muted); }
	.transport { display: flex; align-items: center; gap: 12px; }
	.play {
		flex: none; padding: 0; border-radius: 50%; min-height: 0;
		background: var(--c); border: none; color: var(--ink);
	}
	.play { transition: transform 0.12s, box-shadow 0.15s; }
	@media (hover: hover) {
		.play:hover { background: var(--c); transform: scale(1.07); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 30%, transparent); }
		.wave:hover rect:not(.done) { opacity: 0.45; }
	}
	.play svg { fill: currentColor; }
	.wave { flex: 1; min-width: 0; height: 56px; cursor: pointer; touch-action: none; user-select: none; }
	.wave svg { display: block; width: 100%; height: 100%; }
	.wave:focus-visible { outline: 2px solid var(--paper); outline-offset: 2px; }
	.wave rect { fill: var(--c); opacity: 0.28; transition: opacity 0.1s; }
	.wave rect.done { opacity: 1; }
	.meta { display: flex; justify-content: space-between; gap: 8px; }
	.time { color: var(--dim); font-weight: 400; }
	.heard { color: var(--paper); }
	.meter { position: relative; height: 6px; background: var(--line); border-radius: 3px; }
	.fill { position: absolute; inset: 0 auto 0 0; background: var(--c); border-radius: 3px; transition: width 0.3s; }
	.gate { position: absolute; top: -4px; width: 2px; height: 14px; background: var(--paper); }
	.gatecopy { color: var(--muted); font-weight: 400; }
	.gatecopy.ok { color: var(--c); font-weight: 700; }
	.compact {
		display: flex; align-items: center; gap: 12px;
		background: var(--ink-2); border-left: 4px solid var(--c); border-radius: var(--radius);
		padding: 10px 14px 10px 12px;
	}
	.cname { flex: 1; min-width: 0; font-size: 1.4rem; color: var(--c); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ctag { color: var(--dim); white-space: nowrap; }
	.spinner {
		width: 20px; height: 20px; border-radius: 50%;
		border: 2px solid rgba(0, 0, 0, 0.3); border-top-color: var(--ink);
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
