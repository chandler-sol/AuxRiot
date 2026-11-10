<script lang="ts">
	import { pairStyle } from '#lib/colors.ts';
	import { ago, timeLeft } from '#lib/format.ts';

	interface Battle {
		id: string;
		title: string;
		status: string;
		created_at: number;
		voting_ends_at: number | null;
		winner_id: string | null;
		vote_hours: number;
		creator: string;
		creator_id: string;
		challenger: string | null;
		challenger_id?: string | null;
		votes?: number;
		comments?: number;
		score?: [number, number] | null;
		color_a?: string | null;
		color_b?: string | null;
	}
	let { battle: b, now }: { battle: Battle; now: number } = $props();

	let winnerName = $derived(
		b.status !== 'closed' ? null : b.winner_id === null ? null : b.winner_id === b.creator_id ? b.creator : b.challenger
	);
	let loserIsA = $derived(b.status === 'closed' && b.winner_id !== null && b.winner_id !== b.creator_id);
	let loserIsB = $derived(b.status === 'closed' && b.winner_id !== null && b.winner_id === b.creator_id);
</script>

<a class="bcard" href="/battles/{b.id}" style={pairStyle(b.id, b.color_a, b.color_b)} data-sveltekit-preload-data="hover">
	<span class="edge" aria-hidden="true"><i class="ea"></i><i class="eb"></i></span>
	<span class="body">
		<span class="strip mono">
			{#if b.status === 'voting'}
				<span class="status live">● Live vote</span>
				<span>{b.voting_ends_at ? timeLeft(b.voting_ends_at - now) : ''}</span>
			{:else if b.status === 'open'}
				<span class="status open">○ Needs a challenger</span>
				<span>{b.vote_hours}h vote</span>
			{:else if b.status === 'closed'}
				<span class="status">■ Final</span>
				<span>{winnerName ? `${winnerName} wins` : 'Tie'}</span>
			{:else}
				<span class="status">{b.status}</span>
				<span>{ago(b.created_at, now)}</span>
			{/if}
		</span>

		<span class="names display">
			<span class="na" class:lost={loserIsA}>{b.creator}</span>
			<span class="vs">vs</span>
			{#if b.challenger}
				<span class="nb" class:lost={loserIsB}>{b.challenger}</span>
			{:else}
				<span class="nb tbd">???</span>
			{/if}
		</span>

		<span class="title">{b.title}</span>
		<span class="perf" aria-hidden="true"></span>
		<span class="stub mono">
			<span>
				{#if b.status === 'open'}
					Posted {ago(b.created_at, now)} · {b.comments ?? 0} comment{b.comments === 1 ? '' : 's'}
				{:else if b.status === 'closed' && b.score}
					{b.votes ?? 0} votes · {b.score[0].toFixed(1)} – {b.score[1].toFixed(1)}
				{:else}
					{b.votes ?? 0} vote{b.votes === 1 ? '' : 's'} · {b.comments ?? 0} comment{b.comments === 1 ? '' : 's'}
				{/if}
			</span>
			<span class="admit">Admit one</span>
		</span>
	</span>
</a>

<style>
	.bcard {
		display: flex;
		background: var(--ink-2);
		border-radius: var(--radius);
		overflow: hidden;
		color: var(--paper);
		text-decoration: none;
		transition: transform 0.12s, background 0.15s;
	}
	@media (hover: hover) {
		.bcard:hover { background: #201d19; box-shadow: 0 0 0 1.5px var(--a); transform: translateY(-2px); }
		.bcard:hover .na, .bcard:hover .nb { letter-spacing: 0.01em; }
	}
	.bcard:focus-visible { outline: 2px solid var(--paper); outline-offset: 2px; }
	.na, .nb { transition: letter-spacing 0.2s; }
	.bcard:active { transform: scale(0.99); }
	.edge { display: flex; flex-direction: column; width: 8px; flex: none; }
	.edge i { flex: 1; }
	.ea { background: var(--a); }
	.eb { background: var(--b); }
	.body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; }
	.strip { display: flex; justify-content: space-between; gap: 8px; color: var(--paper); }
	.status { color: var(--muted); }
	.status.live { color: var(--a); }
	.status.open { color: var(--lime); }
	.names { display: flex; flex-direction: column; font-size: clamp(2.4rem, 12vw, 3.4rem); line-height: 0.95; overflow-wrap: anywhere; }
	.na { color: var(--a); }
	.nb { color: var(--b); }
	.tbd { color: var(--muted); }
	.lost { opacity: 0.4; }
	.vs { font-size: 1.1rem; color: var(--muted); letter-spacing: 0.12em; margin: 2px 0; }
	.title { color: var(--dim); font-size: 0.95rem; }
	.perf { border-top: 1.5px dashed var(--line-2); margin: 2px 0; }
	.stub { display: flex; justify-content: space-between; gap: 8px; color: var(--dim); font-weight: 400; }
	.admit { color: var(--muted); font-weight: 700; white-space: nowrap; }
</style>
