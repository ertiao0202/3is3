// scripts/warm-edge.js  Edge Runtime
export const runtime = 'edge';

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REST_TOKEN,
});

const HOST = process.env.VERCEL_URL;

export default async function () {
  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const list = await redis.zrevrange(`top:${day}`, 0, 199, 'WITHSCORES');
  const urls = list.filter((_, i) => i % 2 === 0);
  const tasks = urls.map(u =>
    fetch(`${HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: u, content: u }),
    })
  );
  await Promise.all(tasks);
  return new Response('warmed', { status: 200 });
}
