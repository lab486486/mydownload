import { getCollection, type CollectionEntry } from 'astro:content';
import { extractBodySpecs, orderedSpecRows } from './article';
import { getCategory } from './categories';

export type SoftwareEntry = CollectionEntry<'software'>;

export async function getSoftware() {
  const entries = await getCollection('software');
  return entries.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getListedSoftware() {
  const entries = await getSoftware();
  return entries.filter((entry) => !entry.data.hiddenFromList);
}

export async function getSoftwareByCategory(slug: string) {
  const entries = await getListedSoftware();
  return entries.filter((entry) => entry.data.category === slug);
}

export async function getFeaturedSoftware() {
  const entries = await getListedSoftware();
  const featured = entries.filter((entry) => entry.data.featured);
  if (featured.length >= 8) return featured.slice(0, 12);
  return entries.slice(0, 12);
}

export async function getRelatedSoftware(entry: SoftwareEntry, limit = 8) {
  const entries = await getListedSoftware();
  return entries
    .filter((item) => item.id !== entry.id && item.data.category === entry.data.category)
    .slice(0, limit);
}

export function entryPath(entry: SoftwareEntry) {
  return `/entry/${entry.data.entrySlug}/`;
}

export function categoryLabel(entry: SoftwareEntry) {
  return getCategory(entry.data.category)?.name ?? entry.data.category;
}

export function osLabel(os: string) {
  const labels: Record<string, string> = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    android: 'Android',
    ios: 'iOS',
  };
  return labels[os] ?? os;
}

export function osList(entry: SoftwareEntry) {
  return entry.data.os.map(osLabel).join(', ') || '—';
}

export function fileDate(entry: SoftwareEntry) {
  const value = entry.data.updated ?? entry.data.date;
  return value.toISOString().slice(0, 10).replaceAll('-', '.');
}

export function byName(entries: SoftwareEntry[]) {
  return [...entries].sort((a, b) => a.data.name.localeCompare(b.data.name, 'ko'));
}

export function starLabel(rating: number) {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
}

export function specRows(entry: SoftwareEntry) {
  const extracted = extractBodySpecs(entry.body);
  const rows: { label: string; value: string }[] = [
    { label: '프로그램', value: entry.data.name },
  ];
  if (entry.data.developer) {
    rows.push({ label: '개발사', value: entry.data.developer });
  }
  if (entry.data.license) {
    rows.push({ label: '라이선스', value: entry.data.license });
  }
  rows.push(...extracted);
  if (entry.data.os.length > 0 && !rows.some((row) => row.label === '운영체제')) {
    rows.push({ label: '운영체제', value: osList(entry) });
  }
  for (const spec of entry.data.specs ?? []) {
    if (spec.label && spec.value) {
      rows.push({ label: spec.label, value: spec.value });
    }
  }
  return orderedSpecRows(rows);
}
