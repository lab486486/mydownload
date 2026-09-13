import { getCollection, type CollectionEntry } from 'astro:content';
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

export async function getRelatedSoftware(entry: SoftwareEntry, limit = 6) {
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
