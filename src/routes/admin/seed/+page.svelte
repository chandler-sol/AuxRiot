<script lang="ts">
	import { deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { makeBeat } from '#lib/synth.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// ---- Activity log + one helper that does every action ----
	let log = $state<{ t: string; kind: 'info' | 'ok' | 'err' }[]>([]);
	let busy = $state(false);
	const say = (t: string, kind: 'info' | 'ok' | 'err' = 'info') => (log = [{ t, kind }, ...log].slice(0, 80));

	async function post(action: string, fields: Record<string, string | number | boolean>, beats = 0) {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) if (v !== false) fd.set(k, v === true ? 'on' : String(v));
		for (let i = 0; i < beats; i++) {
			say(`Generating beat ${i + 1} of ${beats}…`);
			const b = await makeBeat();
			fd.set(`audio_${i}`, b.blob, `test-beat-${i + 1}.mp3`);
			fd.set(`peaks_${i}`, JSON.stringify(b.peaks));
		}
		const res = await fetch(`?/${action}`, { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true' } });
		const r = deserialize(await res.text());
		if (r.type === 'success') {
			const d = r.data as { ok?: string; battleId?: string };
			say(d.battleId ? `${d.ok} → /battles/${d.battleId}` : (d.ok ?? 'Done.'), 'ok');
			return d;
		}
		if (r.type === 'redirect') return goto(r.location, { invalidateAll: true });
		say(r.type === 'failure' ? String((r.data as { error?: string })?.error ?? 'Failed.') : 'Server error.', 'err');
		return null;
	}

	async function task(fn: () => Promise<unknown>) {
		if (busy) return;
		busy = true;
		try {
			await fn();
		} catch (e) {
			say(e instanceof Error ? e.message : String(e), 'err');
		} finally {
			busy = false;
			await invalidateAll();
		}
	}

	// ---- Battle builder ----
	type Spec = { rounds: 1 | 3 | 5; stage: string; judges: number; lean: string; wants_ot: boolean; me: string; sell: boolean };
	let spec = $state<Spec>({ rounds: 3, stage: 'voting', judges: 3, lean: 'random', wants_ot: false, me: 'none', sell: false });
	let howMany = $state(1);
	const needsOt = $derived(spec.stage === 'overtime' || spec.stage === 'ot_voting');
	const beatsFor = (s: Pick<Spec, 'rounds' | 'stage'>) => (s.stage === 'open' ? s.rounds : s.rounds * 2 + (s.stage === 'ot_voting' ? 2 : 0));

	async function makeBattles(s: Spec, n: number) {
		for (let i = 0; i < n; i++) {
			say(`Battle ${i + 1} of ${n}: ${s.rounds === 1 ? '1 beat' : `best of ${s.rounds}`}, ${s.stage.replace('_', ' ')}`);
			await post('battle', { ...s }, beatsFor(s));
		}
	}

	const SCENARIOS: { label: string; note: string; run: () => Promise<void> }[] = [
		{
			label: 'Fill the feed',
			note: '3 open, 3 live, 3 finished (with store listings)',
			run: async () => {
				for (const r of [1, 3, 5] as const) await makeBattles({ ...spec, rounds: r, stage: 'open', me: 'none', sell: false }, 1);
				for (const r of [1, 3, 1] as const) await makeBattles({ ...spec, rounds: r, stage: 'voting', judges: 2, lean: 'random', me: 'none', sell: false }, 1);
				for (const r of [1, 3, 1] as const) await makeBattles({ ...spec, rounds: r, stage: 'results', judges: 4, lean: 'a', me: 'none', sell: true }, 1);
			}
		},
		{
			label: 'Store shelf',
			note: '4 finished battles, every beat listed for sale',
			run: () => makeBattles({ ...spec, rounds: 1, stage: 'results', judges: 3, lean: 'b', me: 'none', sell: true }, 4)
		},
		{
			label: 'Judge a Bo3 yourself',
			note: 'Live best of 3 between test users, no votes yet',
			run: () => makeBattles({ ...spec, rounds: 3, stage: 'voting', judges: 0, me: 'none', sell: false }, 1)
		},
		{
			label: 'Overtime offer for me',
			note: 'Bo3 you created, tied — drop your OT beat',
			run: () => makeBattles({ ...spec, rounds: 3, stage: 'overtime', judges: 2, me: 'creator', sell: false }, 1)
		},
		{
			label: 'Someone answered me',
			note: 'Live 1-beat battle you started, 5 judges in',
			run: () => makeBattles({ ...spec, rounds: 1, stage: 'voting', judges: 5, lean: 'random', me: 'creator', sell: false }, 1)
		}
	];

	let newUsers = $state(5);
	let confirmWipe = $state('');
	const STATUS: Record<string, string> = { open: 'Open', voting: 'Live', overtime: 'Overtime', closed: 'Closed', expired: 'Expired' };
</script>

<svelte:head><title>Test lab · AuxRiot beta</title></svelte:head>

<p class="mono muted kicker">Beta only · <a href="/admin">Admin</a></p>
<h1 class="headline">Test <span>lab.</span></h1>
<p class="muted lede">
	Fake producers, generated beats and battles at any stage. Everything here belongs to test accounts ({data.stats?.users ?? 0} now,
	{data.stats?.listed ?? 0} beats listed), and one wipe removes it all. Beats are made in your browser, so keep this tab open while it works.
</p>

<section class="card">
	<h2 class="display">One-click scenarios</h2>
	<div class="scen">
		{#each SCENARIOS as s (s.label)}
			<button disabled={busy} onclick={() => task(s.run)}><span class="display">{s.label}</span><span class="small muted">{s.note}</span></button>
		{/each}
	</div>
</section>

{#if log.length || busy}
	<section class="log mono" aria-live="polite">
		{#if busy}<p class="spin">Working…</p>{/if}
		{#each log as l, i (i + l.t)}<p class={l.kind}>{l.t}</p>{/each}
	</section>
{/if}

<section class="card">
	<h2 class="display">Build battles</h2>
	<div class="grid">
		<label>Format
			<select bind:value={spec.rounds}><option value={1}>1 beat</option><option value={3}>Best of 3</option><option value={5}>Best of 5</option></select>
		</label>
		<label>Stage
			<select bind:value={spec.stage}>
				<option value="open">Open (needs a challenger)</option>
				<option value="voting">Live vote</option>
				<option value="results">Finished (results)</option>
				<option value="overtime" disabled={spec.rounds === 1}>Overtime offered</option>
				<option value="ot_voting" disabled={spec.rounds === 1}>Overtime vote</option>
			</select>
		</label>
		<label>You are
			<select bind:value={spec.me}><option value="none">Not in it</option><option value="creator">The creator</option><option value="challenger" disabled={spec.stage === 'open'}>The challenger</option></select>
		</label>
		<label>Judges
			<input type="number" min="0" max="30" bind:value={spec.judges} disabled={spec.stage === 'open'} />
		</label>
		<label>Judges lean
			<select bind:value={spec.lean} disabled={spec.stage === 'open' || needsOt}>
				<option value="random">Random</option><option value="a">Toward creator</option><option value="b">Toward challenger</option>
				<option value="close">Close</option><option value="tie">Exact tie</option>
			</select>
		</label>
		<label>How many
			<input type="number" min="1" max="10" bind:value={howMany} />
		</label>
	</div>
	<div class="checks">
		<label class="check"><input type="checkbox" bind:checked={spec.wants_ot} disabled={spec.rounds === 1 || spec.stage === 'open'} /> Judges ask for overtime</label>
		<label class="check"><input type="checkbox" bind:checked={spec.sell} /> List the test producers' beats in the store</label>
	</div>
	<p class="small muted">
		{beatsFor(spec) * howMany} beat{beatsFor(spec) * howMany === 1 ? '' : 's'} to generate.
		{#if needsOt}Overtime stages force an exact tie.{/if}
		{#if spec.lean === 'tie' && spec.rounds > 1 && spec.stage === 'results'}A tied best-of goes to overtime.{/if}
	</p>
	<button class="primary" disabled={busy} onclick={() => task(() => makeBattles({ ...spec }, howMany))}>Generate</button>
</section>

<section class="card">
	<h2 class="display">Push battles along</h2>
	<p class="small muted">Recent test battles, plus any live or open ones. Buttons act right away.</p>
	<ul class="rows">
		{#each data.battles as b (b.id)}
			<li>
				<div class="rtop">
					<a href="/battles/{b.id}" class="t">{b.title}</a>
					<span class="mono small tag">{STATUS[b.status] ?? b.status}{b.ot_status ? ` · OT ${b.ot_status}` : ''} · {b.rounds === 1 ? '1 beat' : `Bo${b.rounds}`} · {b.votes} votes</span>
				</div>
				<div class="acts">
					{#if b.status === 'open'}
						<button disabled={busy} onclick={() => task(() => post('answer', { battle: b.id }, b.rounds))}>Test user answers</button>
					{/if}
					{#if b.status === 'voting' || (b.status === 'overtime' && b.ot_status === 'voting')}
						<button disabled={busy} onclick={() => task(() => post('judges', { battle: b.id, judges: 3, lean: 'random' }))}>+3 judges</button>
						<button disabled={busy} onclick={() => task(() => post('judges', { battle: b.id, judges: 2, lean: 'tie' }))}>+2 tied</button>
						{#if b.status === 'voting' && b.rounds > 1}
							<button disabled={busy} onclick={() => task(() => post('judges', { battle: b.id, judges: 5, lean: 'a', wants_ot: true }))}>+5 asking for OT</button>
						{/if}
					{/if}
					{#if b.status === 'overtime' && b.ot_status === 'offered'}
						<button disabled={busy} onclick={() => task(() => post('overtime', { battle: b.id, side: 'both' }, 2))}>Both drop OT</button>
						<button disabled={busy} onclick={() => task(() => post('overtime', { battle: b.id, side: 'a' }, 1))}>Only A drops</button>
						<button disabled={busy} onclick={() => task(() => post('overtime', { battle: b.id, side: 'b' }, 1))}>Only B drops</button>
					{/if}
					{#if b.status === 'voting' || b.status === 'overtime'}
						<button class="warn" disabled={busy} onclick={() => task(() => post('end', { battle: b.id }))}>
							{b.status === 'voting' ? 'End voting now' : b.ot_status === 'offered' ? 'End OT window now' : 'End OT vote now'}
						</button>
					{/if}
					{#if b.status === 'closed' || b.status === 'expired'}
						<button disabled={busy} onclick={() => task(() => post('sell', { battle: b.id }))}>List test beats</button>
					{/if}
				</div>
			</li>
		{:else}
			<li class="muted">No battles yet — try a scenario above.</li>
		{/each}
	</ul>
	<button disabled={busy} onclick={() => task(() => post('sell', {}))}>List every unlisted test beat from finished battles</button>
</section>

<section class="card">
	<h2 class="display">Test producers</h2>
	<div class="inline">
		<input type="number" min="1" max="50" bind:value={newUsers} aria-label="How many producers" />
		<button disabled={busy} onclick={() => task(() => post('users', { count: newUsers }))}>Create producers</button>
	</div>
	<p class="small muted">
		"Log in as" switches you into that account (a bar lets you come back). Judges and opponents are pulled from this pool, and more are made when it runs short.
	</p>
	<ul class="people">
		{#each data.users as u (u.id)}
			<li>
				<a href="/u/{u.username}" class="display">{u.username}</a>
				<span class="mono small muted">{u.beats} beats · {u.listed} listed</span>
				<form method="POST" action="?/loginAs"><input type="hidden" name="user" value={u.id} /><button class="small-btn">Log in as</button></form>
			</li>
		{:else}
			<li class="muted">None yet.</li>
		{/each}
	</ul>
</section>

<section class="card danger">
	<h2 class="display">Wipe test data</h2>
	<p class="small muted">Deletes every test producer and everything that involves one: their battles (even ones you're in), votes, comments, listings and audio files. Your account stays.</p>
	<div class="inline">
		<input bind:value={confirmWipe} placeholder="Type WIPE" aria-label="Type WIPE to confirm" />
		<button class="warn" disabled={busy || confirmWipe !== 'WIPE'} onclick={() => task(async () => { await post('wipe', { confirm: confirmWipe }); confirmWipe = ''; })}>Wipe</button>
	</div>
</section>

<style>
	.kicker { margin: 8px 0 10px; }
	.headline { font-size: clamp(3rem, 14vw, 5rem); line-height: 0.9; margin: 0; }
	.headline span { color: var(--pink); }
	.lede { margin: 10px 0 20px; }
	.card { border: 1.5px solid var(--line-2); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; display: grid; gap: 12px; }
	.card h2 { margin: 0; font-size: 1.6rem; }
	.danger { border-color: var(--warn); }
	.scen { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
	.scen button { display: grid; gap: 4px; text-align: left; padding: 12px; min-height: 0; text-transform: none; letter-spacing: 0; }
	.scen .display { font-size: 1.2rem; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
	.grid label { margin: 0; display: grid; gap: 4px; }
	.checks { display: grid; gap: 6px; }
	.check { display: flex; gap: 8px; align-items: center; margin: 0; text-transform: none; letter-spacing: 0; font-family: var(--body); font-weight: 400; color: var(--dim); font-size: 0.92rem; }
	.check input { width: 18px; height: 18px; accent-color: var(--pink); }
	.log { background: #000; border: 1.5px solid var(--line-2); border-radius: var(--radius); padding: 10px 12px; max-height: 220px; overflow: auto; font-size: 0.75rem; margin-bottom: 16px; }
	.log p { margin: 0 0 4px; color: var(--dim); }
	.log .ok { color: #7dff9b; }
	.log .err { color: var(--pink); }
	.spin { color: var(--warn) !important; }
	.rows, .people { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
	.rows li { border-top: 1px dashed var(--line-2); padding-top: 8px; display: grid; gap: 6px; }
	.rtop { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
	.t { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
	.tag { color: var(--dim); }
	.acts { display: flex; flex-wrap: wrap; gap: 6px; }
	.acts button, .small-btn { min-height: 32px; padding: 4px 10px; font-size: 0.8rem; }
	.warn { border-color: var(--warn); color: var(--warn); }
	.inline { display: flex; gap: 8px; flex-wrap: wrap; }
	.inline input { width: 140px; }
	.people li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; border-top: 1px dashed var(--line-2); padding-top: 8px; }
	.people .display { font-size: 1.1rem; }
	.people form { margin-left: auto; }
</style>
