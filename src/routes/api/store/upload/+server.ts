import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { checkMagic, checkUploadStart, type ListingRow } from '#lib/server/store.ts';
import { PART_BYTES } from '#lib/store.ts';

/**
 * Chunked upload of a listing's private files (full WAV/MP3 or stems zip)
 * straight into R2 under store/, which is never served publicly.
 *   POST {op:'start', listingId, kind, fileName, size} → {uploadId, partBytes}
 *   PUT  ?uploadId=…&part=N   (raw bytes, ≤ 50 MB)    → {partNumber, etag}
 *   POST {op:'complete', uploadId, parts}             → {ok}
 *   POST {op:'abort', uploadId}
 */

type Upload = { upload_id: string; listing_id: string; kind: 'file' | 'stems'; r2_key: string; file_name: string; declared_size: number };

async function ownedListing(db: D1Database, listingId: string, userId: string) {
	const l = await db.prepare('SELECT * FROM listings WHERE id = ? AND seller_id = ?').bind(listingId, userId).first<ListingRow>();
	if (!l) error(404, 'Listing not found');
	if (l.status === 'sold' || l.status === 'removed') error(400, "This beat can't be changed anymore.");
	return l;
}

async function ownedUpload(db: D1Database, uploadId: string, userId: string) {
	const u = await db
		.prepare('SELECT u.* FROM store_uploads u JOIN listings l ON l.id = u.listing_id WHERE u.upload_id = ? AND l.seller_id = ?')
		.bind(uploadId, userId)
		.first<Upload>();
	if (!u) error(404, 'Upload not found');
	return u;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) error(401);
	const env = getEnv();
	const db = env.DB;
	const body = (await request.json()) as Record<string, unknown>;

	if (body.op === 'start') {
		const listing = await ownedListing(db, String(body.listingId), user.id);
		const kind = body.kind === 'stems' ? 'stems' : 'file';
		const fileName = String(body.fileName ?? '').slice(0, 200);
		const size = Number(body.size);
		const check = checkUploadStart(kind, fileName, size);
		if ('error' in check) return json({ error: check.error }, { status: 400 });
		const key = `store/${listing.id}/${kind}-${newId(10)}.${check.ext}`;
		const mpu = await env.AUDIO.createMultipartUpload(key, {
			httpMetadata: { contentType: check.ext === 'zip' ? 'application/zip' : check.ext === 'wav' ? 'audio/wav' : 'audio/mpeg' }
		});
		await db
			.prepare('INSERT INTO store_uploads (upload_id, listing_id, kind, r2_key, file_name, declared_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(mpu.uploadId, listing.id, kind, key, fileName, size, Date.now())
			.run();
		return json({ uploadId: mpu.uploadId, partBytes: PART_BYTES });
	}

	if (body.op === 'complete') {
		const up = await ownedUpload(db, String(body.uploadId), user.id);
		const listing = await ownedListing(db, up.listing_id, user.id);
		const parts = (Array.isArray(body.parts) ? body.parts : []) as { partNumber: number; etag: string }[];
		if (!parts.length) return json({ error: 'Nothing was uploaded.' }, { status: 400 });
		const mpu = env.AUDIO.resumeMultipartUpload(up.r2_key, up.upload_id);
		const obj = await mpu.complete(parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })));
		// The finished object must match what they told us at the start.
		if (obj.size !== up.declared_size) {
			await env.AUDIO.delete(up.r2_key);
			await db.prepare('DELETE FROM store_uploads WHERE upload_id = ?').bind(up.upload_id).run();
			return json({ error: 'Upload was incomplete. Try again.' }, { status: 400 });
		}
		const ext = up.r2_key.split('.').pop()!;
		const old = up.kind === 'file' ? listing.file_key : listing.stems_key;
		const sql =
			up.kind === 'file'
				? 'UPDATE listings SET file_key = ?, file_name = ?, file_size = ?, file_format = ?, updated_at = ? WHERE id = ?'
				: 'UPDATE listings SET stems_key = ?, stems_name = ?, stems_size = ?, updated_at = ? WHERE id = ?';
		const stmt =
			up.kind === 'file'
				? db.prepare(sql).bind(up.r2_key, up.file_name, obj.size, ext, Date.now(), listing.id)
				: db.prepare(sql).bind(up.r2_key, up.file_name, obj.size, Date.now(), listing.id);
		await db.batch([stmt, db.prepare('DELETE FROM store_uploads WHERE upload_id = ?').bind(up.upload_id)]);
		if (old && old !== up.r2_key) await env.AUDIO.delete(old);
		return json({ ok: true, size: obj.size, name: up.file_name });
	}

	if (body.op === 'abort') {
		const up = await ownedUpload(db, String(body.uploadId), user.id);
		await env.AUDIO.resumeMultipartUpload(up.r2_key, up.upload_id).abort().catch(() => {});
		await db.prepare('DELETE FROM store_uploads WHERE upload_id = ?').bind(up.upload_id).run();
		return json({ ok: true });
	}

	error(400, 'Unknown operation');
};

export const PUT: RequestHandler = async ({ request, locals, url }) => {
	const user = locals.user;
	if (!user) error(401);
	const env = getEnv();
	const up = await ownedUpload(env.DB, url.searchParams.get('uploadId') ?? '', user.id);
	const part = Number(url.searchParams.get('part'));
	if (!Number.isInteger(part) || part < 1 || part > 10000) error(400, 'Bad part number');
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength === 0 || bytes.byteLength > PART_BYTES) error(400, 'Bad chunk size');
	if (part === 1 && !checkMagic(up.r2_key.split('.').pop()!, bytes.subarray(0, 16))) {
		await env.AUDIO.resumeMultipartUpload(up.r2_key, up.upload_id).abort().catch(() => {});
		await env.DB.prepare('DELETE FROM store_uploads WHERE upload_id = ?').bind(up.upload_id).run();
		return json({ error: up.kind === 'stems' ? "That isn't a real .zip file." : "That isn't a real WAV or MP3 file." }, { status: 400 });
	}
	const res = await env.AUDIO.resumeMultipartUpload(up.r2_key, up.upload_id).uploadPart(part, bytes);
	return json({ partNumber: res.partNumber, etag: res.etag });
};
