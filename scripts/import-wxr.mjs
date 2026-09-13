import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_XML = '/Users/myhome/Downloads/WordPress.2026-09-13.xml';
const SOFTWARE_DIR = path.join(ROOT, 'src', 'content', 'software');
const REDIRECTS = path.join(ROOT, 'public', '_redirects');
const SHORTLINKS = path.join(ROOT, 'public', 'shortlinks.json');

const MANUAL_REDIRECTS = `/entry/category/유틸리티 /category/utility/ 301
/entry/category/%ec%9c%a0%ed%8b%b8%eb%a6%ac%ed%8b%b0 /category/utility/ 301
/entry/category/문서편집 /category/office/ 301
/entry/category/%eb%ac%b8%ec%84%9c%ed%8e%b8%ec%a7%91 /category/office/ 301
/entry/category/동영상-오디오 /category/media/ 301
/entry/category/%eb%8f%99%ec%98%81%ec%83%81-%ec%98%a4%eb%94%94%ec%98%a4 /category/media/ 301
/entry/category/pc관리-보안 /category/security/ 301
/entry/category/pc%ea%b4%80%eb%a6%ac-%eb%b3%b4%ec%95%88 /category/security/ 301
/entry/category/인터넷-통신 /category/internet/ 301
/entry/category/%ec%9d%b8%ed%84%b0%eb%84%b7-%ed%86%b5%ec%8b%a0 /category/internet/ 301
/entry/category/이미지-그래픽 /category/graphics/ 301
/entry/category/%ec%9d%b4%eb%af%b8%ec%a7%80-%ea%b7%b8%eb%9e%98%ed%94%bd /category/graphics/ 301
/entry/category/다운로드 /category/utility/ 301
/entry/category/%eb%8b%a4%ec%9a%b4%eb%a1%9c%eb%93%9c /category/utility/ 301
/entry/category/미분류 /category/utility/ 301
/entry/category/%eb%af%b8%eb%b6%84%eb%a5%98 /category/utility/ 301
/privacy-policy /privacy/ 301
/privacy-policy/ /privacy/ 301
`.trim();

function tag(block, name) {
  const match = block.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[(.*?)\\]\\]>|(.*?))</${name}>`, 's'),
  );
  if (!match) return '';
  return (match[1] ?? match[2] ?? '').trim();
}

function decodeSlug(value) {
  let text = String(value || '').trim();
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(text);
      if (next === text) break;
      text = next;
    } catch {
      break;
    }
  }
  return text;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const parts = text.split('---', 3);
  const data = {};
  for (const line of (parts[1] || '').split('\n')) {
    if (!line.includes(':')) continue;
    const idx = line.indexOf(':');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) data[key] = value;
  }
  return data;
}

function parseItems(xml) {
  return [...xml.matchAll(/<item>(.*?)<\/item>/gs)].map((match) => match[1]);
}

async function main() {
  const xmlPath = process.argv[2] || DEFAULT_XML;
  const xml = await readFile(xmlPath, 'utf8');
  const published = [];
  for (const block of parseItems(xml)) {
    if (tag(block, 'wp:post_type') !== 'post' || tag(block, 'wp:status') !== 'publish') {
      continue;
    }
    const id = tag(block, 'wp:post_id');
    const link = tag(block, 'link');
    const rawPath = new URL(link).pathname.replace(/^\/entry\//, '').replace(/\/$/, '');
    published.push({
      id,
      title: tag(block, 'title'),
      link,
      slug: decodeSlug(rawPath || tag(block, 'wp:post_name')),
    });
  }

  const files = (await readdir(SOFTWARE_DIR)).filter((name) => name.endsWith('.md'));
  const byId = new Map();
  for (const file of files) {
    const raw = await readFile(path.join(SOFTWARE_DIR, file), 'utf8');
    const meta = parseFrontmatter(raw);
    if (meta.legacyId) byId.set(String(meta.legacyId), { file, ...meta });
  }

  const missing = published.filter((post) => !byId.has(post.id));
  const slugMismatch = [];
  for (const post of published) {
    const local = byId.get(post.id);
    if (local && local.entrySlug !== post.slug) {
      slugMismatch.push({ id: post.id, xml: post.slug, local: local.entrySlug });
    }
  }

  const shortlinks = {};
  const lines = [MANUAL_REDIRECTS, '', '# WordPress permalinks'];
  for (const post of published) {
    const dest = `/entry/${post.slug}/`;
    shortlinks[post.id] = dest;
    lines.push(`/p/${post.id} ${dest} 301`);
    lines.push(`/p/${post.id}/ ${dest} 301`);
    const encoded = encodeURI(`/entry/${post.slug}/`);
    const encodedLower = encoded.replace(/%[0-9A-F]{2}/g, (part) => part.toLowerCase());
    if (encoded !== dest) lines.push(`${encoded} ${dest} 301`);
    if (encodedLower !== dest && encodedLower !== encoded) {
      lines.push(`${encodedLower} ${dest} 301`);
    }
  }
  lines.push('', '# 첨부 파일 옛 주소는 글 본문으로');
  lines.push('/entry/:slug/* /entry/:slug/ 301');
  lines.push('');

  await writeFile(REDIRECTS, `${lines.join('\n')}\n`);
  await writeFile(SHORTLINKS, `${JSON.stringify(shortlinks, null, 2)}\n`);

  console.log(`XML 공개 글 ${published.length}개, 사이트 글 ${files.length}개`);
  if (missing.length) {
    console.log('사이트에 없는 글:');
    for (const post of missing) console.log(`  ${post.id} ${post.title} ${post.link}`);
    process.exitCode = 1;
  } else {
    console.log('모든 공개 글이 /entry/{슬러그}/ 로 연결되어 있습니다.');
  }
  if (slugMismatch.length) {
    console.log('슬러그 불일치:');
    for (const item of slugMismatch) console.log(`  ${item.id} xml=${item.xml} local=${item.local}`);
    process.exitCode = 1;
  }
  console.log(`wrote ${path.relative(ROOT, REDIRECTS)}`);
  console.log(`wrote ${path.relative(ROOT, SHORTLINKS)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
