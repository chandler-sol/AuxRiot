import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const me = locals.user.id;
	const rows = await getEnv()
		.DB.prepare(
			`SELECT c.id, c.buyer_id, c.seller_id, c.last_message_at, c.order_id,
			        CASE WHEN c.buyer_id = ?1 THEN c.buyer_read_at ELSE c.seller_read_at END AS my_read,
			        o.username, o.avatar_key, o.color, b.title, b.id AS battle_id,
			        (SELECT m.body FROM messages m JOIN users s ON s.id = m.sender_id
			         WHERE m.conversation_id = c.id AND m.hidden = 0 AND (s.shadowbanned = 0 OR m.sender_id = ?1)
			         ORDER BY m.created_at DESC LIMIT 1) AS last_body,
			        (SELECT m.sender_id FROM messages m JOIN users s ON s.id = m.sender_id
			         WHERE m.conversation_id = c.id AND m.hidden = 0 AND (s.shadowbanned = 0 OR m.sender_id = ?1)
			         ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
			        (SELECT MAX(m.created_at) FROM messages m JOIN users s ON s.id = m.sender_id
			         WHERE m.conversation_id = c.id AND m.sender_id != ?1 AND m.hidden = 0 AND s.shadowbanned = 0) AS their_last
			 FROM conversations c
			 JOIN users o ON o.id = CASE WHEN c.buyer_id = ?1 THEN c.seller_id ELSE c.buyer_id END
			 LEFT JOIN listings l ON l.id = c.listing_id LEFT JOIN battles b ON b.id = l.battle_id
			 WHERE c.buyer_id = ?1 OR c.seller_id = ?1
			 ORDER BY c.last_message_at DESC LIMIT 100`
		)
		.bind(me)
		.all<{
			id: string; buyer_id: string; seller_id: string; last_message_at: number; order_id: string | null; my_read: number;
			username: string; avatar_key: string | null; color: string | null; title: string | null; battle_id: string | null;
			last_body: string | null; last_sender: string | null; their_last: number | null;
		}>();
	return {
		threads: rows.results
			.filter((r) => r.last_body !== null)
			.map((r) => ({
				id: r.id,
				role: r.buyer_id === me ? 'buying' : 'selling',
				other: { username: r.username, avatarKey: r.avatar_key, color: r.color },
				title: r.title,
				preview: r.last_body!,
				mine: r.last_sender === me,
				unread: (r.their_last ?? 0) > r.my_read,
				at: r.last_message_at,
				purchased: !!r.order_id
			})),
		now: Date.now()
	};
};
