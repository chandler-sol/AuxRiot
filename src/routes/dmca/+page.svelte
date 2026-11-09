<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>DMCA &amp; copyright · AuxRiot</title></svelte:head>

<article class="stack">
	<section class="card stack">
		<h1>Copyright &amp; DMCA takedowns</h1>
		<p>
			We respect the rights of artists and rights holders and respond to notices under the Digital Millennium
			Copyright Act (DMCA). Sampling is part of beat culture, but if a rights holder sends a valid notice, the beat is
			removed. Producers are warned about this every time they upload.
		</p>
		<h2>What happens after you file</h2>
		<ol>
			<li>We review the notice, usually within a few days.</li>
			<li>If it's valid, we remove the audio and notify the uploader.</li>
			<li>The uploader may send a counter-notice if they believe the removal was a mistake.</li>
			<li>Accounts with repeated valid takedowns are terminated.</li>
		</ol>
		<p class="muted small">
			Knowingly misrepresenting that material is infringing can make you liable for damages (17 U.S.C. § 512(f)).
		</p>
	</section>

	<section class="card stack">
		<h2>File a takedown notice</h2>
		{#if form?.sent}
			<p class="success">Notice received. We'll review it and contact you at the email you provided.</p>
		{:else}
			<form method="POST" class="stack" use:enhance={() => async ({ update }) => update({ reset: false })}>
				<div>
					<label for="battle_url">Battle URL</label>
					<input id="battle_url" name="battle_url" type="text" required value={form?.battle_url ?? ''} placeholder="https://…/battles/abc123" />
				</div>
				<div>
					<label for="slot">Which beat?</label>
					<select id="slot" name="slot">
						<option value="">Not sure / both</option>
						<option value="0">The original (first) beat</option>
						<option value="1">The challenger (second) beat</option>
					</select>
				</div>
				<div>
					<label for="work_description">Describe the copyrighted work and how it is infringed</label>
					<textarea id="work_description" name="work_description" required>{form?.work_description ?? ''}</textarea>
				</div>
				<div>
					<label for="claimant_name">Your full legal name</label>
					<input id="claimant_name" name="claimant_name" type="text" required value={form?.claimant_name ?? ''} />
				</div>
				<div>
					<label for="claimant_email">Contact email</label>
					<input id="claimant_email" name="claimant_email" type="email" required value={form?.claimant_email ?? ''} />
				</div>
				<label class="check"><input type="checkbox" name="good_faith" required /> I have a good-faith belief that use of the material is not authorized by the copyright owner, its agent, or the law.</label>
				<label class="check"><input type="checkbox" name="accuracy" required /> The information in this notice is accurate, and under penalty of perjury, I am the owner or authorized to act on behalf of the owner.</label>
				<div>
					<label for="signature">Electronic signature (type your full name)</label>
					<input id="signature" name="signature" type="text" required value={form?.signature ?? ''} />
				</div>
				{#if form?.error}<p class="error">{form.error}</p>{/if}
				<button class="primary">Submit notice</button>
			</form>
		{/if}
	</section>
</article>

<style>
	ol { padding-left: 1.2em; }
	.check { display: flex; gap: 10px; align-items: flex-start; font-weight: 500; }
	.check input { width: 20px; height: 20px; flex: none; margin-top: 2px; accent-color: var(--accent); }
</style>
