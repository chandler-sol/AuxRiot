<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import { SOCIALS } from '#lib/socials.ts';
	import { PALETTE, hexFor } from '#lib/colors.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let bio = $state('');
	let color = $state('');
	let links = $state<Record<string, string>>({});
	let seeded = false;
	$effect.pre(() => {
		if (seeded) return;
		seeded = true;
		bio = data.bio;
		color = data.color ?? '';
		links = Object.fromEntries(SOCIALS.map((s) => [s.key, displayValue(s.key, data.socials[s.key] ?? '')]));
	});

	/** Show "@handle" instead of the full URL when the link is a plain profile on that platform. */
	function displayValue(key: string, url: string) {
		const s = SOCIALS.find((x) => x.key === key);
		if (!url || !s?.template) return url;
		const [pre, post] = s.template.split('{h}');
		if (url.startsWith(pre) && url.endsWith(post) && !url.slice(pre.length).includes('/')) {
			return '@' + url.slice(pre.length, url.length - post.length);
		}
		return url;
	}

	// Avatar: crop to a centered square and shrink to 320px in the browser before upload.
	let preview = $state<string | null>(null);
	let avatarBlob = $state<Blob | null>(null);
	let avatarErr = $state('');
	let busy = $state(false);
	let saving = $state(false);
	let newsOn = $state(false);
	let battleOn = $state(true);
	let msgOn = $state(true);
	let newsSeeded = false;
	$effect.pre(() => {
		if (newsSeeded) return;
		newsSeeded = true;
		newsOn = data.newsOptIn;
		battleOn = data.notifyBattles;
		msgOn = data.notifyMessages;
	});

	async function pickAvatar(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		avatarErr = '';
		if (!file) return;
		if (file.size > 25 * 1024 * 1024) {
			avatarErr = 'That image is huge — pick one under 25 MB.';
			return;
		}
		try {
			const bmp = await createImageBitmap(file);
			const side = Math.min(bmp.width, bmp.height);
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 320;
			canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
			let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
			if (!blob || blob.type !== 'image/webp') blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
			if (!blob) throw new Error();
			avatarBlob = blob;
			if (preview) URL.revokeObjectURL(preview);
			preview = URL.createObjectURL(blob);
		} catch {
			avatarErr = "Couldn't read that image. Try a JPEG or PNG.";
		}
	}
</script>

<svelte:head><title>Edit profile · AuxRiot</title></svelte:head>

<p class="mono muted kicker">Settings — profile</p>
<h1 class="headline">Your <span>poster.</span></h1>

<section class="block">
	<h2>Picture</h2>
	<div class="avrow">
		{#if preview}
			<img class="pv" src={preview} alt="Your new avatar" width="96" height="96" />
		{:else}
			<Avatar username={data.username} avatarKey={data.avatarKey} color={color || null} size={96} />
		{/if}
		<div class="avactions">
			<label class="btn pick">
				<input type="file" accept="image/*" onchange={pickAvatar} />
				Choose image
			</label>
			{#if avatarBlob}
				<form
					method="POST"
					action="?/avatar"
					enctype="multipart/form-data"
					use:enhance={({ formData }) => {
						formData.set('avatar', avatarBlob!, avatarBlob!.type === 'image/webp' ? 'a.webp' : 'a.jpg');
						busy = true;
						return async ({ update, result }) => {
							await update({ reset: false });
							busy = false;
							if (result.type === 'success') avatarBlob = null;
						};
					}}
				>
					<button class="primary" disabled={busy}>{busy ? 'Saving…' : 'Save picture'}</button>
				</form>
			{:else if data.avatarKey}
				<form method="POST" action="?/removeAvatar" use:enhance>
					<button class="link-btn">Remove picture</button>
				</form>
			{/if}
		</div>
	</div>
	<p class="mono muted hint">Square-cropped automatically. Keep it respectful — it shows next to your comments.</p>
	{#if avatarErr || form?.avatarError}<p class="error">{avatarErr || form?.avatarError}</p>{/if}
	{#if form?.avatarSaved}<p class="success">Picture updated.</p>{/if}
</section>

<form
	method="POST"
	action="?/save"
	class="block"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<h2>Your color</h2>
	<p class="muted small">
		Your name, your tile and your side of every battle. If your opponent already has a color too close to yours, you'll get
		the best contrasting one for that battle.
	</p>
	<div class="swatches" role="radiogroup" aria-label="Signature color">
		{#each PALETTE as c (c.key)}
			<label class="sw" title={c.label} style:--sw={c.hex}>
				<input type="radio" name="color" value={c.key} bind:group={color} />
				<span class="chip"></span>
				<span class="sr">{c.label}</span>
			</label>
		{/each}
	</div>
	<p class="mono preview-name" style:color={hexFor(color || null)}>{data.username}{color ? '' : ' — default'}</p>

	<h2 class="links-h">Bio</h2>
	<textarea name="bio" maxlength={data.bioMax} rows="3" placeholder="Who you are, what you make, what gear you swear by." bind:value={bio}></textarea>
	<p class="mono muted count" class:over={bio.length > data.bioMax - 10}>{bio.length} / {data.bioMax}</p>

	<h2 class="links-h">Links</h2>
	<p class="muted small">Only the ones you fill in show on your profile. A handle like <span class="mono">@yourname</span> works for most.</p>
	<div class="links">
		{#each SOCIALS as s (s.key)}
			<label class="link">
				<span class="ic" title={s.label}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={s.path} /></svg></span>
				<span class="sr">{s.label}</span>
				<input type="text" name={s.key} placeholder={s.placeholder} autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={links[s.key]} />
			</label>
		{/each}
	</div>

	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.saved}<p class="success">Profile saved. <a href="/u/{data.username}">View it</a></p>{/if}
	<button class="primary full" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
</form>

<section class="block">
	<h2>Email preferences</h2>
	<form method="POST" action="?/battleEmails" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<label class="optin">
			<input type="checkbox" name="on" bind:checked={battleOn} onchange={(e) => (e.currentTarget as HTMLInputElement).form?.requestSubmit()} />
			<span>
				<strong>Battle alerts</strong> — when someone answers your battle, when results are in, and a nudge if your open battle is still waiting.
			</span>
		</label>
		<noscript><button>Save</button></noscript>
	</form>
	<form method="POST" action="?/messageEmails" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<label class="optin">
			<input type="checkbox" name="on" bind:checked={msgOn} onchange={(e) => (e.currentTarget as HTMLInputElement).form?.requestSubmit()} />
			<span><strong>Message alerts</strong> — an email when a buyer or producer messages you (at most one per conversation every 30 minutes).</span>
		</label>
		<noscript><button>Save</button></noscript>
	</form>
	{#if form?.messageEmailsSaved}<p class="success small">{form.messageEmailsSaved === 'on' ? 'Message alerts on.' : 'Message alerts off.'}</p>{/if}
	{#if form?.battleEmailsSaved}<p class="success small">{form.battleEmailsSaved === 'on' ? 'Battle alerts on.' : 'Battle alerts off.'}</p>{/if}
	<form method="POST" action="?/news" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<label class="optin">
			<input type="checkbox" name="news" bind:checked={newsOn} onchange={(e) => (e.currentTarget as HTMLInputElement).form?.requestSubmit()} />
			<span>
				<strong>AuxRiot news</strong> — battle of the week, events, new features. A few emails a month at most.
			</span>
		</label>
		<noscript><button>Save</button></noscript>
	</form>
	{#if form?.newsSaved}<p class="success small">{form.newsSaved === 'subscribed' ? "You're on the list." : "You're off the list."}</p>{/if}
	{#if newsOn && !data.emailVerified}<p class="muted small">Confirm your email to start getting news.</p>{/if}
	<p class="muted small">Account emails (confirmations, password resets) always come through.</p>
</section>

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(3rem, 15vw, 5rem); line-height: 0.9; }
	.headline span { color: var(--pink); }
	.block { margin-top: 28px; }
	.avrow { display: flex; align-items: center; gap: 16px; }
	.pv { width: 96px; height: 96px; border-radius: var(--radius); object-fit: cover; }
	.avactions { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
	.pick { position: relative; cursor: pointer; margin: 0; }
	.pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.hint { font-weight: 400; margin: 12px 0 0; }
	.count { text-align: right; font-weight: 400; margin: 6px 0 0; }
	.count.over { color: var(--warn); }
	.links-h { margin-top: 24px; }
	.links { display: grid; gap: 8px; margin: 12px 0 16px; }
	.link { display: flex; align-items: stretch; margin: 0; text-transform: none; letter-spacing: 0; }
	.ic {
		display: inline-flex; align-items: center; justify-content: center; width: 46px; flex: none;
		border: 1.5px solid var(--line-2); border-right: 0; border-radius: var(--radius) 0 0 var(--radius); color: var(--dim);
	}
	.ic svg { fill: currentColor; }
	.link input { border-radius: 0 var(--radius) var(--radius) 0; }
	.link:focus-within .ic { color: var(--paper); border-color: var(--paper); }
	.full { width: 100%; }
	.optin { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; margin: 8px 0; font-family: var(--body); font-size: 0.95rem; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--dim); }
	.optin strong { color: var(--paper); }
	.optin input { width: 22px; height: 22px; flex: none; margin-top: 1px; accent-color: var(--pink); }
	.swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 12px 0 10px; max-width: 360px; }
	.sw { position: relative; margin: 0; cursor: pointer; }
	.sw input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
	.chip { display: block; aspect-ratio: 1; background: var(--sw); border-radius: var(--radius); border: 3px solid transparent; outline: 1.5px solid transparent; transition: transform 0.1s; }
	.sw input:checked + .chip { border-color: var(--ink); outline-color: var(--paper); transform: scale(1.04); }
	.sw input:focus-visible + .chip { outline-color: var(--paper); outline-width: 2px; }
	@media (hover: hover) { .sw:hover .chip { transform: scale(1.08); } }
	.preview-name { font-family: var(--display); font-size: 2rem; font-weight: 400; margin: 0 0 8px; letter-spacing: 0.02em; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
