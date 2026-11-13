<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import { ago } from '#lib/format.ts';
	import { money } from '#lib/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let body = $state('');
	let reporting = $state<string | null>(null);
	let busy = $state(false);
	let list = $state<HTMLElement>();
	// This page marks the thread read on load; refresh the header's unread badge afterwards.
	onMount(() => {
		invalidate('app:unread');
	});

	$effect(() => {
		void data.messages.length;
		list?.lastElementChild?.scrollIntoView({ block: 'end' });
	});
</script>

<svelte:head><title>{data.other ? `@${data.other.username}` : 'Message'} · AuxRiot</title></svelte:head>

<p class="mono muted kicker"><a href="/messages">← Inbox</a></p>
{#if data.other}
	<div class="head">
		<Avatar username={data.other.username} avatarKey={data.other.avatarKey} color={data.other.color} size={48} />
		<div>
			<a class="display who" href="/u/{data.other.username}">@{data.other.username}</a>
			<Flair respect={data.other.respect} />
		</div>
	</div>
{/if}

{#if data.listing}
	<a class="ctx" href="/battles/{data.listing.battle_id}#buy">
		<span class="mono small">{data.role === 'buyer' ? 'About' : 'Asking about your beat'}</span>
		<span class="display">"{data.listing.title}"</span>
		<span class="mono small">
			{#if data.purchased}Purchased{:else if data.listing.status === 'sold'}Sold{:else if data.listing.status === 'listed'}{money(data.listing.price_cents)}{data.listing.stems_price_cents ? ` · ${money(data.listing.stems_price_cents)} with stems` : ''}{:else}Not on sale right now{/if}
		</span>
	</a>
{/if}

<p class="safety small">
	🔒 <strong>Keep deals on AuxRiot.</strong> Buying through the site gets you the files, a license and protection. Payments anywhere else — Cash App, PayPal, wire — aren't protected and we can't help if something goes wrong.
</p>

{#if form?.ok}<p class="success">{form.ok}</p>{/if}

<ol class="msgs" bind:this={list}>
	{#each data.messages as m (m.id)}
		<li class:mine={m.mine}>
			<div class="bubble">{m.body}</div>
			<div class="meta mono">
				{ago(m.at, data.now)}
				{#if !m.mine}
					<button class="link-btn" onclick={() => (reporting = reporting === m.id ? null : m.id)}>Report</button>
				{/if}
			</div>
			{#if m.offPlatform}
				<p class="warn small">⚠️ This mentions contact or payment info. Deals made outside AuxRiot aren't protected.</p>
			{/if}
			{#if reporting === m.id}
				<form method="POST" action="?/report" class="report" use:enhance={() => async ({ update }) => { await update({ reset: false }); reporting = null; }}>
					<input type="hidden" name="message_id" value={m.id} />
					<select name="reason" aria-label="Reason">
						<option value="scam">Scam / off-site payment</option>
						<option value="harassment">Harassment</option>
						<option value="spam">Spam</option>
						<option value="other">Other</option>
					</select>
					<button class="small-btn">Send report</button>
				</form>
			{/if}
		</li>
	{:else}
		<li class="muted small">No messages yet.</li>
	{/each}
</ol>

{#if data.canSend}
	<form
		method="POST"
		action="?/send"
		class="compose"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				if (result.type === 'success') body = '';
			};
		}}
	>
		<textarea name="body" rows="3" maxlength="2000" placeholder="Write a message…" bind:value={body} required></textarea>
		{#if form?.error}<p class="error small">{form.error}</p>{/if}
		<div class="row"><button class="primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button></div>
	</form>
{:else}
	<p class="muted small">{data.iBlocked ? "You blocked this person." : "You can't reply to this conversation."}</p>
{/if}

<form method="POST" action="?/block" class="blockf" use:enhance={() => async ({ update }) => update({ reset: false })}>
	<input type="hidden" name="on" value={data.iBlocked ? '0' : '1'} />
	<button class="link-btn mono small">{data.iBlocked ? 'Unblock' : 'Block'} @{data.other?.username}</button>
</form>

<style>
	.kicker { margin: 8px 0 12px; }
	.kicker a { color: var(--muted); }
	.head { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
	.head > div { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
	.who { font-size: 1.7rem; line-height: 1; color: var(--paper); text-decoration: none; }
	.ctx { display: flex; flex-direction: column; gap: 2px; background: var(--ink-2); border-left: 4px solid var(--pink); border-radius: var(--radius); padding: 10px 12px; color: var(--paper); text-decoration: none; margin-bottom: 10px; }
	.ctx .mono { color: var(--dim); font-weight: 400; }
	.ctx .display { font-size: 1.3rem; }
	.safety { background: var(--ink-2); border: 1.5px dashed var(--line-2); border-radius: var(--radius); padding: 10px 12px; color: var(--dim); margin: 0 0 14px; }
	.safety strong { color: var(--paper); }
	.msgs { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
	.msgs li { display: flex; flex-direction: column; align-items: flex-start; max-width: 86%; }
	.msgs li.mine { align-self: flex-end; align-items: flex-end; }
	.bubble { background: var(--ink-2); border: 1.5px solid var(--line-2); border-radius: 14px 14px 14px 4px; padding: 10px 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
	.mine .bubble { background: var(--paper); color: var(--ink); border-color: var(--paper); border-radius: 14px 14px 4px 14px; }
	.meta { display: flex; gap: 10px; color: var(--muted); font-size: 0.58rem; font-weight: 400; margin-top: 4px; }
	.meta .link-btn { color: var(--muted); font-size: 0.58rem; }
	.warn { color: var(--warn); margin: 4px 0 0; }
	.report { display: flex; gap: 6px; margin-top: 6px; }
	.report select { padding: 6px 8px; }
	.small-btn { min-height: 36px; padding: 0 12px; font-size: 0.9rem; }
	.compose { display: grid; gap: 8px; }
	.compose .row { justify-content: flex-end; }
	.blockf { margin-top: 18px; text-align: right; }
	.blockf .link-btn { color: var(--muted); }
</style>
