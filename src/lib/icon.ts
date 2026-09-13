export function listIcon(src?: string) {
  if (!src) return '';
  if (!src.startsWith('/uploads/')) return src;
  const rest = src.slice('/uploads/'.length).replace(/\.[^.]+$/, '.webp');
  return `/thumbs/${rest}`;
}
