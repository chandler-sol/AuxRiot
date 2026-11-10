<script lang="ts">
	/**
	 * Full-screen winner reveal. Phases: counting → name drops in → score counts
	 * up → WINNER stamp lands. Tap, click or Escape to dismiss. With reduced
	 * motion it shows the final state immediately.
	 */
	interface Props {
		counting?: boolean; // waiting for the server to tally
		tag: string;
		winnerName?: string | null; // null = tie
		winnerColor?: string;
		loserName?: string;
		loserColor?: string;
		winnerScore?: number;
		loserScore?: number;
		onclose: () => void;
	}
	let {
		counting = false,
		tag,
		winnerName = null,
		winnerColor = 'var(--paper)',
		loserName = '',
		loserColor = 'var(--muted)',
		winnerScore = 0,
		loserScore = 0,
		onclose
	}: Props = $props();

	let phase = $state(0); // 0 intro, 1 name, 2 score, 3 stamp
	let shownScore = $state(0);
	let shownLoser = $state(0);

	$effect(() => {
		if (counting) return;
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduce) {
			phase = 3;
			shownScore = winnerScore;
			shownLoser = loserScore;
			return;
		}
		phase = 0;
		const timers = [
			setTimeout(() => (phase = 1), 900),
			setTimeout(() => {
				phase = 2;
				const t0 = performance.now();
				const step = (t: number) => {
					const k = Math.min(1, (t - t0) / 900);
					const e = 1 - Math.pow(1 - k, 3);
					shownScore = winnerScore * e;
					shownLoser = loserScore * e;
					if (k < 1) raf = requestAnimationFrame(step);
				};
				raf = requestAnimationFrame(step);
			}, 1600),
			setTimeout(() => (phase = 3), 2700)
		];
		let raf = 0;
		return () => {
			timers.forEach(clearTimeout);
			cancelAnimationFrame(raf);
		};
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	// Confetti pieces in both battle colors (fixed pseudo-random layout).
	const pieces = Array.from({ length: 36 }, (_, i) => ({
		left: (i * 37) % 100,
		delay: ((i * 53) % 100) / 100,
		dur: 2.2 + ((i * 29) % 10) / 10,
		rot: (i * 47) % 360,
		w: 6 + (i % 3) * 3,
		alt: i % 3 === 0
	}));
</script>

<svelte:window onkeydown={onKey} />

<div
	class="overlay"
	role="dialog"
	aria-modal="true"
	aria-label={counting ? 'Counting votes' : winnerName ? `${winnerName} wins` : "It's a tie"}
	tabindex="-1"
	onclick={() => !counting && onclose()}
	onkeydown={() => {}}
	style:--w={winnerColor}
	style:--l={loserColor}
>
	{#if counting}
		<div class="center">
			<p class="mono kicker">Battle {tag}</p>
			<p class="display time">Time.</p>
			<p class="mono counting">Counting votes<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>
		</div>
	{:else}
		{#if phase >= 1 && winnerName}
			<div class="burst" aria-hidden="true"></div>
			<div class="confetti" aria-hidden="true">
				{#each pieces as p, i (i)}
					<i
						style:left="{p.left}%"
						style:animation-delay="{p.delay}s"
						style:animation-duration="{p.dur}s"
						style:width="{p.w}px"
						style:--r="{p.rot}deg"
						style:background={p.alt ? 'var(--paper)' : 'var(--w)'}
					></i>
				{/each}
			</div>
		{/if}
		<div class="center">
			<p class="mono kicker" class:in={phase >= 0}>Battle {tag} — the votes are in</p>
			{#if phase >= 1}
				{#if winnerName}
					<h2 class="display name">{winnerName}</h2>
				{:else}
					<h2 class="display name tie">Dead even</h2>
				{/if}
			{/if}
			{#if phase >= 2}
				<p class="score">
					<span class="display big" style:color="var(--w)">{shownScore.toFixed(1)}</span>
					<span class="display dash">—</span>
					<span class="display big lose" style:color="var(--l)">{shownLoser.toFixed(1)}</span>
				</p>
				{#if winnerName && loserName}<p class="mono over">over {loserName}</p>{/if}
			{/if}
			{#if phase >= 3}
				{#if winnerName}
					<div class="stamp" aria-hidden="true"><span class="display">Winner</span><span class="mono">By crowd vote</span></div>
				{/if}
				<button class="primary see" onclick={onclose}>See the card</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.overlay {
		position: fixed; inset: 0; z-index: 100;
		background: rgba(14, 13, 11, 0.97);
		display: flex; align-items: center; justify-content: center;
		overflow: hidden; padding: 24px;
		animation: fade 0.25s ease-out;
	}
	.center { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 720px; width: 100%; }
	.kicker { color: var(--muted); margin: 0 0 16px; }
	.time { font-size: clamp(5rem, 30vw, 10rem); line-height: 0.9; margin: 0; color: var(--paper); animation: thump 0.5s cubic-bezier(0.2, 1.6, 0.4, 1); }
	.counting { color: var(--dim); margin-top: 14px; }
	.dots i { font-style: normal; animation: blink 1.2s infinite; }
	.dots i:nth-child(2) { animation-delay: 0.2s; }
	.dots i:nth-child(3) { animation-delay: 0.4s; }

	.name {
		font-size: clamp(3.6rem, 20vw, 9rem); line-height: 0.88; margin: 0 0 18px; color: var(--w);
		overflow-wrap: anywhere; text-transform: uppercase;
		animation: drop 0.7s cubic-bezier(0.2, 1.4, 0.4, 1) both, shake 0.35s 0.55s;
	}
	.tie { color: var(--paper); }
	.score { display: flex; align-items: baseline; gap: 12px; margin: 0; animation: fade 0.3s both; }
	.big { font-size: clamp(3rem, 14vw, 5rem); line-height: 1; font-variant-numeric: tabular-nums; }
	.lose { opacity: 0.55; }
	.dash { font-size: 2rem; color: var(--muted); }
	.over { color: var(--muted); margin: 6px 0 0; }
	.stamp {
		display: flex; flex-direction: column; align-items: center; margin-top: 22px;
		border: 4px solid var(--paper); border-radius: 4px; padding: 8px 16px 6px; color: var(--paper);
		transform: rotate(-8deg);
		animation: stamp 0.45s cubic-bezier(0.3, 1.8, 0.5, 1) both;
	}
	.stamp .display { font-size: 2.6rem; letter-spacing: 0.1em; line-height: 1; }
	.stamp .mono { font-size: 0.6rem; }
	.see { margin-top: 26px; animation: fade 0.4s 0.3s both; }

	.burst {
		position: absolute; inset: -20%;
		background: radial-gradient(circle at 50% 45%, var(--w) 0%, transparent 45%);
		opacity: 0; animation: burst 1.4s ease-out;
	}
	.confetti i {
		position: absolute; top: -20px; height: 14px; border-radius: 1px;
		transform: rotate(var(--r)); animation: fall linear forwards;
	}

	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	@keyframes blink { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
	@keyframes thump { from { transform: scale(1.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
	@keyframes drop { from { transform: scale(2.4) translateY(-30px); opacity: 0; filter: blur(8px); } to { transform: none; opacity: 1; filter: none; } }
	@keyframes shake { 0%, 100% { translate: 0 0; } 25% { translate: -6px 2px; } 50% { translate: 5px -2px; } 75% { translate: -3px 1px; } }
	@keyframes stamp { from { transform: rotate(-8deg) scale(3); opacity: 0; } to { transform: rotate(-8deg) scale(1); opacity: 1; } }
	@keyframes burst { 0% { opacity: 0; transform: scale(0.6); } 25% { opacity: 0.35; } 100% { opacity: 0; transform: scale(1.4); } }
	@keyframes fall { to { transform: translateY(110vh) rotate(calc(var(--r) + 540deg)); } }

	@media (prefers-reduced-motion: reduce) {
		.overlay, .time, .name, .score, .stamp, .see, .burst, .dots i { animation: none !important; }
		.confetti, .burst { display: none; }
	}
</style>
