<script lang="ts">
	import { enhance } from '$app/forms';
	import { renderNewsletter, TEMPLATES, type NewsDraft, type TemplateKey } from '#lib/newsletter.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let draft = $state<NewsDraft>(TEMPLATES.announcement.draft());
	let battleId = $state('');
	let confirmText = $state('');
	let busy = $state('');
	let imageErr = $state('');

	function pick(key: TemplateKey) {
		if (key === draft.template) return;
		draft = TEMPLATES[key].draft();
		battleId = '';
	}
	function setBattle(id: string) {
		battleId = id;
		draft.battle = data.battles.find((b) => b.id === id)?.battle ?? null;
	}

	let preview = $derived(
		renderNewsletter(draft, { unsubscribeUrl: '#unsubscribe', preferencesUrl: '#preferences' }).html
	);
	let draftJson = $derived(JSON.stringify(draft));

	// Shrink big images to 1072px wide (2x the 536px email column) before upload.
	let imageBlob = $state<Blob | null>(null);
	async function pickImage(e: Event) {
		imageErr = '';
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		if (file.type === 'image/gif') {
			imageBlob = file;
			return;
		}
		try {
			const bmp = await createImageBitmap(file);
			const w = Math.min(1072, bmp.width);
			const h = Math.round((bmp.height * w) / bmp.width);
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
			imageBlob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.86));
		} catch {
			imageErr = "Couldn't read that image.";
		}
	}
</script>

<svelte:head><title>Compose news · AuxRiot admin</title></svelte:head>

<p class="mono muted kicker"><a href="/admin">Admin</a> — AuxRiot news</p>
<h1 class="headline">Compose <span>news.</span></h1>

<div class="status">
	<div><span class="display">{data.counts.subscribers}</span><span class="mono">Subscribers</span></div>
	<div><span class="display">{data.counts.pending}</span><span class="mono">Waiting to sync</span></div>
	<div><span class="display">{data.counts.unverified}</span><span class="mono">Opted in, unconfirmed</span></div>
</div>
{#if !data.ready}
	<p class="warn">
		Sending is off until the marketing key is added in Cloudflare (<span class="mono">RESEND_ADMIN_KEY</span>). You can still
		build emails and send yourself tests.
	</p>
{:else if data.counts.pending}
	<form method="POST" action="?/sync" use:enhance><button class="link-btn">Sync {data.counts.pending} waiting subscribers now</button></form>
{/if}
{#if form?.ok}<p class="success">{form.ok}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

<div class="grid">
	<div class="fields">
		<section>
			<h2>1. Template</h2>
			<div class="tpls">
				{#each data.templates as t (t.key)}
					<button type="button" class="tpl" class:on={draft.template === t.key} onclick={() => pick(t.key as TemplateKey)}>
						<span class="display">{t.name}</span><span class="small muted">{t.blurb}</span>
					</button>
				{/each}
			</div>
			<p class="muted small">Switching templates resets the fields to that template's starting text.</p>
		</section>

		<section class="stack">
			<h2>2. Inbox line</h2>
			<div><label for="subject">Subject</label><input id="subject" type="text" maxlength="150" bind:value={draft.subject} /></div>
			<div>
				<label for="pre">Preview text (shows after the subject in inboxes)</label>
				<input id="pre" type="text" maxlength="150" bind:value={draft.preheader} placeholder="Optional" />
			</div>
		</section>

		<section class="stack">
			<h2>3. Headline</h2>
			<div class="two">
				<div><label for="kicker">Top-right tag</label><input id="kicker" type="text" maxlength="40" bind:value={draft.kicker} /></div>
				<div><label for="label">Small label</label><input id="label" type="text" maxlength="60" bind:value={draft.label} /></div>
			</div>
			<div class="two">
				<div><label for="h1">Headline</label><input id="h1" type="text" maxlength="60" bind:value={draft.headline1} /></div>
				<div><label for="h2">Second line (pink)</label><input id="h2" type="text" maxlength="60" bind:value={draft.headline2} /></div>
			</div>
			<div><label for="intro">Intro</label><textarea id="intro" rows="2" maxlength="600" bind:value={draft.intro}></textarea></div>
		</section>

		<section class="stack">
			<h2>4. Extras</h2>
			<div>
				<span class="lab">Image (optional)</span>
				<div class="row">
					<label class="btn pick"><input type="file" accept="image/*" onchange={pickImage} />Choose image</label>
					{#if imageBlob}
						<form
							method="POST"
							action="?/image"
							enctype="multipart/form-data"
							use:enhance={({ formData }) => {
								formData.set('image', imageBlob!, imageBlob!.type === 'image/gif' ? 'i.gif' : 'i.jpg');
								busy = 'image';
								return async ({ result, update }) => {
									busy = '';
									if (result.type === 'success' && result.data?.imageUrl) {
										draft.imageUrl = String(result.data.imageUrl);
										imageBlob = null;
									} else await update({ reset: false });
								};
							}}
						>
							<button class="primary" disabled={busy === 'image'}>{busy === 'image' ? 'Uploading…' : 'Upload'}</button>
						</form>
					{/if}
					{#if draft.imageUrl}<button type="button" class="link-btn" onclick={() => (draft.imageUrl = '')}>Remove image</button>{/if}
				</div>
				{#if imageErr || form?.imageError}<p class="error small">{imageErr || form?.imageError}</p>{/if}
			</div>

			<label class="check"><input type="checkbox" bind:checked={draft.showStats} /> Show a stats strip</label>
			{#if draft.showStats}
				<div class="stats-in">
					{#each draft.stats as s, i (i)}
						<div class="stat-in">
							<input type="text" maxlength="16" placeholder="Number" bind:value={s.value} />
							<input type="text" maxlength="24" placeholder="Label" bind:value={s.label} />
						</div>
					{/each}
				</div>
			{/if}

			<div>
				<label for="battle">Feature a battle (optional)</label>
				<select id="battle" value={battleId} onchange={(e) => setBattle((e.currentTarget as HTMLSelectElement).value)}>
					<option value="">No battle</option>
					{#each data.battles as b (b.id)}<option value={b.id}>{b.label}</option>{/each}
				</select>
			</div>
		</section>

		<section class="stack">
			<h2>5. Sections</h2>
			{#each draft.sections as s, i (i)}
				<div class="section-in">
					<input type="text" maxlength="60" placeholder="Section title (optional)" bind:value={s.title} />
					<textarea rows="4" maxlength="2000" placeholder="Body — line breaks are kept" bind:value={s.body}></textarea>
					{#if draft.sections.length > 1}
						<button type="button" class="link-btn" onclick={() => draft.sections.splice(i, 1)}>Remove section</button>
					{/if}
				</div>
			{/each}
			{#if draft.sections.length < 4}
				<button type="button" onclick={() => draft.sections.push({ title: '', body: '' })}>+ Add section</button>
			{/if}
			<div><label for="sig">Sign-off name (optional)</label><input id="sig" type="text" maxlength="40" bind:value={draft.signature} placeholder="e.g. ARSENiK" /></div>
		</section>

		<section class="stack">
			<h2>6. Button</h2>
			<div class="two">
				<div><label for="bt">Button text (blank = no button)</label><input id="bt" type="text" maxlength="40" bind:value={draft.buttonText} /></div>
				<div><label for="bu">Button link</label><input id="bu" type="text" maxlength="300" bind:value={draft.buttonUrl} /></div>
			</div>
			<label class="check"><input type="checkbox" bind:checked={draft.buttonPink} /> Pink button (louder)</label>
		</section>

		<section class="stack send">
			<h2>7. Send</h2>
			<form
				method="POST"
				action="?/test"
				use:enhance={() => {
					busy = 'test';
					return async ({ update }) => {
						await update({ reset: false });
						busy = '';
					};
				}}
			>
				<input type="hidden" name="draft" value={draftJson} />
				<button disabled={busy === 'test'}>{busy === 'test' ? 'Sending…' : 'Send me a test'}</button>
			</form>
			<form
				method="POST"
				action="?/send"
				class="stack"
				use:enhance={() => {
					busy = 'send';
					return async ({ update }) => {
						await update({ reset: false });
						busy = '';
						confirmText = '';
					};
				}}
			>
				<input type="hidden" name="draft" value={draftJson} />
				<label for="confirm">Type SEND to email {data.counts.subscribers} subscriber{data.counts.subscribers === 1 ? '' : 's'}</label>
				<input id="confirm" name="confirm" type="text" autocomplete="off" bind:value={confirmText} />
				<button class="primary" disabled={!data.ready || confirmText !== 'SEND' || busy === 'send'}>
					{busy === 'send' ? 'Sending…' : 'Send to subscribers'}
				</button>
			</form>
		</section>

		{#if data.sends.length}
			<section>
				<h2>Sent</h2>
				{#each data.sends as s (s.id)}
					<p class="small"><strong>{s.subject}</strong> <span class="muted">· {s.template} · {s.recipients} recipients · {new Date(s.created_at).toLocaleString()}</span></p>
				{/each}
			</section>
		{/if}
	</div>

	<div class="preview">
		<p class="mono muted">Live preview — this is the email</p>
		<iframe title="Email preview" srcdoc={preview} sandbox=""></iframe>
	</div>
</div>

<style>
	.kicker { margin: 8px 0 10px; }
	.kicker a { color: var(--muted); }
	.headline { font-size: clamp(3rem, 12vw, 4.6rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.status { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; background: var(--paper); color: var(--ink); border-radius: var(--radius); padding: 12px 8px 10px; text-align: center; margin: 8px 0 12px; }
	.status div { display: flex; flex-direction: column; }
	.status .display { font-size: 2rem; line-height: 1; }
	.status .mono { color: #5a544b; font-size: 0.58rem; margin-top: 4px; }
	.warn { color: var(--warn); }
	.grid { display: grid; gap: 24px; margin-top: 16px; }
	section { margin-bottom: 28px; }
	section h2 { font-size: 1.5rem; }
	.tpls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
	.tpl { flex-direction: column; align-items: flex-start; height: auto; min-height: 0; padding: 12px 14px; text-align: left; gap: 4px; text-transform: none; letter-spacing: 0; font-family: var(--body); }
	.tpl .display { font-size: 1.3rem; text-transform: uppercase; }
	.tpl.on { border-color: var(--pink); background: rgba(255, 61, 127, 0.08); }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.lab { display: block; font-family: var(--mono); font-weight: 700; font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); margin-bottom: 6px; }
	.pick { position: relative; margin: 0; cursor: pointer; }
	.pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.check { display: flex; gap: 10px; align-items: center; cursor: pointer; font-family: var(--body); font-size: 0.95rem; text-transform: none; letter-spacing: 0; color: var(--paper); }
	.check input { width: 20px; height: 20px; accent-color: var(--pink); }
	.stats-in { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
	.stat-in { display: grid; gap: 6px; }
	.section-in { display: grid; gap: 6px; padding-bottom: 10px; border-bottom: 1px dashed var(--line-2); }
	.send button { width: 100%; }
	.preview iframe { width: 100%; height: 900px; border: 1px solid var(--line-2); border-radius: var(--radius); background: #0e0d0b; }
	@media (min-width: 1080px) {
		.grid { grid-template-columns: minmax(0, 1fr) 640px; align-items: start; }
		.preview { position: sticky; top: 84px; }
		.preview iframe { height: calc(100vh - 140px); }
	}
</style>
