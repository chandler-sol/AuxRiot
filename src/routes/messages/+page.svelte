<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import { ago } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Messages · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Inbox</p>
<h1 class="headline">Messages</h1>

{#if data.threads.length}
	<ul class="threads">
		{#each data.threads as t (t.id)}
			<li>
				<a href="/messages/{t.id}" class:unread={t.unread}>
					<Avatar username={t.other.username} avatarKey={t.other.avatarKey} color={t.other.color} size={44} />
					<span class="body">
						<span class="top">
							<span class="display who">@{t.other.username}</span>
							<span class="mono when">{ago(t.at, data.now)}</span>
						</span>
						<span class="mono about">{t.role === 'buying' ? 'You asked about' : 'Asking about'} {t.title ? `"${t.title}"` : 'a beat'}{t.purchased ? ' · purchased' : ''}</span>
						<span class="preview">{t.mine ? 'You: ' : ''}{t.preview}</span>
					</span>
					{#if t.unread}<span class="dot" aria-label="Unread"></span>{/if}
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<p class="muted">No messages yet. Questions about a beat you want? Hit <strong>Ask the producer</strong> on any beat for sale.</p>
{/if}

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(2.8rem, 12vw, 4.4rem); line-height: 0.9; margin-bottom: 16px; }
	.threads { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
	.threads a { display: flex; gap: 12px; align-items: center; padding: 12px; background: var(--ink-2); color: var(--paper); text-decoration: none; }
	.threads li:first-child a { border-radius: var(--radius) var(--radius) 0 0; }
	.threads li:last-child a { border-radius: 0 0 var(--radius) var(--radius); }
	.threads a:hover { background: var(--ink-3); }
	.body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	.top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
	.who { font-size: 1.2rem; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.when { color: var(--muted); font-size: 0.6rem; font-weight: 400; white-space: nowrap; }
	.about { color: var(--dim); font-size: 0.62rem; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.preview { color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.unread .preview { color: var(--paper); font-weight: 700; }
	.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--pink); flex: none; }
</style>
