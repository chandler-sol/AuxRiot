<script lang="ts">
	import { goto } from '$app/navigation';
	import { ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	function nav(e: Event) {
		const f = (e.currentTarget as HTMLElement).closest('form') as HTMLFormElement;
		const p = new URLSearchParams();
		for (const [k, v] of new FormData(f)) if (v) p.set(k, String(v));
		goto(`/admin/log?${p}`, { reset: false });
	}
	const VERB: Record<string, string> = {
		'battle.end_now': 'ended voting early',
		'battle.clock': 'changed the clock',
		'battle.recount': 'recounted',
		'battle.remove': 'removed a battle',
		'battle.restore': 'restored a battle',
		'entry.remove': 'deleted a beat',
		'vote.full': 'counted a ballot fully',
		'vote.half': 'halved a ballot',
		'vote.zero': 'zeroed a ballot',
		'vote.delete': 'deleted a ballot',
		'comment.hide': 'hid a comment',
		'comment.unhide': 'unhid a comment',
		'comment.approve': 'approved a held comment',
		'user.suspend': 'suspended',
		'user.unsuspend': 'lifted a suspension',
		'user.shadowban': 'shadowbanned',
		'user.unshadowban': 'lifted a shadowban',
		'user.make_mod': 'made a moderator',
		'user.remove_mod': 'removed a moderator',
		'report.dismiss': 'dismissed reports',
		'report.resolve': 'marked reports handled',
		'credits.grant': 'gave credits',
		'credits.clawback': 'took back credits',
		'credits.drop': 'ran a credit drop',
		'credits.backfill': 'paid out past battles',
		'settings.voter_age': 'changed voter age',
		'settings.credits_min_votes': 'changed the payout minimum',
		'settings.blocked_words': 'updated blocked words',
		'promo.book': 'booked a promo',
		'promo.cancel': 'cancelled a promo',
		'dmca.remove': 'acted on a DMCA notice',
		'dmca.reject': 'rejected a DMCA notice'
	};
	function link(e: (typeof data.entries)[number]) {
		if (e.target_type === 'battle') return `/admin/battles/${e.target_id}`;
		if (e.target_type === 'vote') return `/admin/battles/${e.target_id.split(':')[0]}`;
		if (e.target_type === 'comment' && e.comment_battle) return `/admin/comments?battle=${e.comment_battle}`;
		if (e.target_type === 'user' && e.target_user) return `/admin/users?q=${encodeURIComponent(e.target_user)}`;
		return null;
	}
	const olderHref = $derived.by(() => {
		const p = new URLSearchParams();
		if (data.actor) p.set('actor', data.actor);
		if (data.kind) p.set('kind', data.kind);
		if (data.nextBefore) p.set('before', String(data.nextBefore));
		return `/admin/log?${p}`;
	});
</script>

<svelte:head><title>Mod log · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Mod tools</a> — Mod log</p>
<h1 class="headline">Mod <span>log.</span></h1>
<p class="small muted">Every moderator and admin action, newest first. Nothing here can be edited or deleted.</p>

<form class="filters" method="GET" action="/admin/log">
	<select name="actor" value={data.actor} onchange={nav} aria-label="Who">
		<option value="">Everyone on staff</option>
		{#each data.staff as s (s.username)}<option value={s.username}>{s.username}{s.is_admin ? ' (admin)' : ''}</option>{/each}
	</select>
	<select name="kind" value={data.kind} onchange={nav} aria-label="Kind">
		<option value="">All actions</option>
		{#each data.kinds as k (k)}<option value={k}>{k}</option>{/each}
	</select>
	<noscript><button>Go</button></noscript>
</form>

<ol class="log">
	{#each data.entries as e (e.id)}
		{@const href = link(e)}
		<li>
			<span class="mono when" title={new Date(e.created_at).toLocaleString()}>{ago(e.created_at, data.now)}</span>
			<span class="what">
				<strong>{e.actor}</strong>
				{VERB[e.action] ?? e.action}
				{#if e.target_user && e.target_type === 'user'}<strong>{e.target_user}</strong>{/if}
				{#if e.details && !(e.target_type === 'user' && e.details === e.target_user)}<span class="muted"> — {e.details}</span>{/if}
				{#if href}<a class="mono" {href}>view →</a>{/if}
			</span>
		</li>
	{:else}
		<li class="muted">Nothing logged yet.</li>
	{/each}
</ol>
{#if data.more}<p><a class="btn" href={olderHref}>Older →</a></p>{/if}

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 14px 0; }
	.log { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
	.log li { display: grid; grid-template-columns: 72px 1fr; gap: 10px; background: var(--ink-2); padding: 10px 12px; }
	.log li:first-child { border-radius: var(--radius) var(--radius) 0 0; }
	.log li:last-child { border-radius: 0 0 var(--radius) var(--radius); }
	.when { color: var(--dim); font-size: 0.62rem; font-weight: 400; padding-top: 3px; }
	.what { overflow-wrap: anywhere; }
	.what a { color: var(--pink); font-size: 0.66rem; margin-left: 6px; text-decoration: none; }
</style>
