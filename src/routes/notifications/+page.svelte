<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import Avatar from '#lib/components/Avatar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// The server marked everything read on this visit; refresh the bell count.
	onMount(() => {
		invalidate('app:notes');
	});

	/** One glyph per kind, so the list scans fast. */
	const ICONS: Record<string, string> = {
		battle_answered: '🥊', battle_result: '🏆', battle_expired: '⌛', battle_waiting: '📣', battle_removed: '⚠', result_reversed: '↩',
		ot_offered: '⏱', ot_opponent_dropped: '⏱', ot_vote_open: '⏱',
		judge_credits: '★', ballot_reminder: '✎',
		mention: '@', battle_comment: '💬', respect_tier: '★', crew_join: '⚑', verified: '✓',
		beat_sold: '💸', purchase: '🎧', listing_question: '?', question_answered: '✓', order_refunded: '↩', payouts_status: '$',
		credits_granted: '+', report_actioned: '🛡'
	};

	const ago = (t: number) => {
		const m = Math.round((Date.now() - t) / 60_000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m} min`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h} hr`;
		const d = Math.round(h / 24);
		return d < 7 ? `${d} day${d === 1 ? '' : 's'}` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	};
	const today = new Date().setHours(0, 0, 0, 0);
	const section = (t: number) => (t >= today ? 'Today' : t >= today - 6 * 86_400_000 ? 'This week' : 'Earlier');
</script>

<svelte:head><title>Notifications · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Notifications</p>
<h1 class="headline">What you <span>missed.</span></h1>

{#if !data.items.length}
	<p class="muted">Nothing yet. Battles, tags, sales and credits show up here.</p>
{/if}

<ul class="list">
	{#each data.items as n, i (n.id)}
		{#if i === 0 || section(n.created_at) !== section(data.items[i - 1].created_at)}
			<li class="sec mono">{section(n.created_at)}</li>
		{/if}
		<li>
			<a class="note" class:unread={!n.read_at} href={n.url}>
				{#if n.actor}
					<Avatar username={n.actor} avatarKey={n.actor_avatar} color={n.actor_color} size={36} />
				{:else}
					<span class="ico display" aria-hidden="true">{ICONS[n.kind] ?? '•'}</span>
				{/if}
				<span class="txt">{n.text}</span>
				<span class="mono small when">{ago(n.created_at)}</span>
			</a>
		</li>
	{/each}
</ul>

<p class="mono small muted foot">Email settings for battles, tags and messages are in <a href="/settings/profile#emails">Edit profile</a>.</p>

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(3rem, 14vw, 5rem); line-height: 0.9; margin: 0 0 18px; }
	.headline span { color: var(--pink); }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
	.sec { color: var(--dim); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 10px; }
	.note { display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; border: 1.5px solid var(--line-2); border-radius: var(--radius); text-decoration: none; color: var(--dim); }
	.note:hover { border-color: var(--paper); }
	.note.unread { border-color: var(--pink); color: var(--paper); background: linear-gradient(90deg, rgba(255, 61, 127, 0.08), transparent 70%); }
	.ico { width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--radius); background: var(--ink-2); font-size: 1.1rem; color: var(--paper); }
	.txt { min-width: 0; overflow-wrap: anywhere; line-height: 1.4; }
	.when { color: var(--dim); white-space: nowrap; }
	.foot { margin-top: 18px; }
</style>
