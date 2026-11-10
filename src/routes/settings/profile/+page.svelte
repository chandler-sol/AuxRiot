<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import { SOCIALS } from '#lib/socials.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let bio = $state('');
	let links = $state<Record<string, string>>({});
	let seeded = false;
	$effect.pre(() => {
		if (seeded) return;
		seeded = true;
		bio = data.bio;
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
			<Avatar username={data.username} avatarKey={data.avatarKey} size={96} />
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
	<h2>Bio</h2>
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
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
