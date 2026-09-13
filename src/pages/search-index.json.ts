import type { APIRoute } from 'astro';
import { listIcon } from '../lib/icon';
import { categoryLabel, entryPath, fileDate, getListedSoftware, osList } from '../lib/software';

export const GET: APIRoute = async () => {
  const entries = await getListedSoftware();
  const payload = entries.map((entry) => ({
    name: entry.data.name,
    title: entry.data.title,
    excerpt: entry.data.excerpt ?? '',
    href: entryPath(entry),
    category: categoryLabel(entry),
    os: osList(entry),
    developer: entry.data.developer ?? '—',
    date: fileDate(entry),
    icon: listIcon(entry.data.icon),
    tags: entry.data.tags,
  }));

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
