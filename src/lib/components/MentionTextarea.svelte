<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { MAX_MENTIONS, extractMentions } from '#lib/mentions.ts';

	/**
	 * Textarea with @mention autocomplete. `people` are suggested first (the battlers,
	 * then everyone in the thread); typing more searches all users.
	 */
	type Person = { username: string; avatarKey?: string | null; color?: string | null; tag?: string | null; verified?: string | null };
	let {
		value = $bindable(''),
		people = [],
		name = 'body',
		placeholder = '',
		maxlength = 1000
	}: { value?: string; people?: Person[]; name?: string; placeholder?: string; maxlength?: number } = $props();

	let el: HTMLTextAreaElement;
	let query = $state<string | null>(null);
	let remote = $state<Person[]>([]);
	let active = $state(0);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const cache = new Map<string, Person[]>();

	const suggestions = $derived.by(() => {
		if (query === null) return [];
		const q = query.toLowerCase();
		const seen = new Set<string>();
		const out: Person[] = [];
		for (const p of [...people, ...remote]) {
			const k = p.username.toLowerCase();
			if (seen.has(k) || !k.startsWith(q)) continue;
			seen.add(k);
			out.push(p);
			if (out.length >= 6) break;
		}
		return out;
	});
	const tooMany = $derived(extractMentions(value).length > MAX_MENTIONS);

	/** The @word being typed right before the caret, if any. */
	function tokenAtCaret() {
		const pos = el.selectionStart ?? value.length;
		const m = value.slice(0, pos).match(/(^|[^\w@])@([a-zA-Z0-9_]{0,20})$/);
		return m ? { q: m[2], start: pos - m[2].length - 1, end: pos } : null;
	}

	function onInput() {
		const t = tokenAtCaret();
		query = t ? t.q : null;
		active = 0;
		clearTimeout(timer);
		if (!t || !t.q) {
			remote = [];
			return;
		}
		const key = t.q.toLowerCase();
		if (cache.has(key)) {
			remote = cache.get(key)!;
			return;
		}
		timer = setTimeout(async () => {
			try {
				const r = await fetch(`/api/users/search?q=${encodeURIComponent(t.q)}`);
				const list = r.ok ? ((await r.json()) as Person[]) : [];
				cache.set(key, list);
				if (query !== null && query.toLowerCase() === key) remote = list;
			} catch {
				/* offline: local suggestions still work */
			}
		}, 150);
	}

	function pick(p: Person) {
		const t = tokenAtCaret();
		if (!t) return;
		const insert = `@${p.username} `;
		value = value.slice(0, t.start) + insert + value.slice(t.end);
		query = null;
		remote = [];
		const caret = t.start + insert.length;
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(caret, caret);
		});
	}

	function onKeydown(e: KeyboardEvent) {
		if (!suggestions.length) return;
		if (e.key === 'ArrowDown') active = (active + 1) % suggestions.length;
		else if (e.key === 'ArrowUp') active = (active - 1 + suggestions.length) % suggestions.length;
		else if (e.key === 'Enter' || e.key === 'Tab') pick(suggestions[active]);
		else if (e.key === 'Escape') query = null;
		else return;
		e.preventDefault();
	}
</script>

<div class="wrap">
	<textarea
		bind:this={el}
		bind:value
		{name}
		{placeholder}
		{maxlength}
		required
		oninput={onInput}
		onkeydown={onKeydown}
		onclick={onInput}
		onblur={() => setTimeout(() => (query = null), 150)}
		role="combobox"
		aria-expanded={suggestions.length > 0}
		aria-controls="mention-list"
		aria-autocomplete="list"
	></textarea>
	{#if suggestions.length}
		<ul class="sugg" id="mention-list" role="listbox">
			{#each suggestions as p, i (p.username)}
				<li role="option" aria-selected={i === active}>
					<button type="button" class:on={i === active} onmousedown={(e) => { e.preventDefault(); pick(p); }}>
						<Avatar username={p.username} avatarKey={p.avatarKey ?? null} color={p.color ?? null} size={24} />
						<span class="mono">@{p.username}</span>
						{#if p.tag}<span class="mono tag">{p.tag}</span>{:else if p.verified}<span class="mono tag v">✓ {p.verified}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if tooMany}<p class="error small">Tag up to {MAX_MENTIONS} people per comment.</p>{/if}
</div>

<style>
	.wrap { position: relative; }
	.wrap textarea { width: 100%; box-sizing: border-box; }
	.sugg { position: absolute; left: 0; right: 0; top: 100%; z-index: 30; list-style: none; margin: 4px 0 0; padding: 4px; background: var(--ink-2); border: 1.5px solid var(--paper); border-radius: var(--radius); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); }
	.sugg button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 4px 8px; border: 0; background: transparent; text-align: left; text-transform: none; letter-spacing: 0; color: var(--paper); font-size: 0.85rem; }
	.sugg button.on, .sugg button:hover { background: var(--ink); }
	.tag { margin-left: auto; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--pink); }
	.tag.v { color: var(--cyan, #2bd9f5); }
</style>
