import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import TurndownService from 'turndown';

const ROOT = path.resolve(import.meta.dirname, '..');
const WP = 'https://mydownload.co.kr';
const IMAGE_BASE = process.env.PUBLIC_IMAGE_BASE ?? '';
const HEADERS = {
  Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
};

const CATEGORY_BY_ID = {
  69: 'utility',
  70: 'internet',
  71: 'security',
  72: 'media',
  73: 'graphics',
  74: 'office',
};

const FEATURED_KEYS = new Set([
  '7zip',
  'kakaotalk',
  'alzip',
  'hancom-office',
  'hangul',
  'alpdf',
  'bandizip',
]);

const OFFICIAL_DOWNLOADS = {
  '7zip': [{ os: 'windows', label: 'Windows 다운로드', url: 'https://www.7-zip.org/download.html' }],
  kakaotalk: [
    { os: 'windows', label: 'Windows 다운로드', url: 'https://www.kakaocorp.com/page/service/service/KakaoTalk' },
    { os: 'macos', label: 'macOS 다운로드', url: 'https://www.kakaocorp.com/page/service/service/KakaoTalk' },
  ],
  alzip: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://www.estsoft.co.kr/product/alzip' }],
  bandiview: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://www.bandisoft.com/bandiview/' }],
  bandizip: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://kr.bandisoft.com/bandizip/' }],
  bandicam: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://www.bandicam.com/kr/' }],
  photoscape: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://www.photoscape.org/' }],
  'copytrans-heic': [
    { os: 'windows', label: 'Windows 다운로드', url: 'https://www.copytrans.net/copytransheic/' },
  ],
  teamviewer: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://www.teamviewer.com/ko/download/' }],
  chrome: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://www.google.com/chrome/' }],
  discord: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://discord.com/download' }],
  'hancom-office': [
    { os: 'windows', label: 'Windows 다운로드', url: 'https://www.hancom.com/cs_center/csDownload.do' },
  ],
  hangul: [{ os: 'windows', label: 'Windows 다운로드', url: 'https://www.hancom.com/cs_center/csDownload.do' }],
};

const KEY_RULES = [
  [/7[\s-]?zip|7zip/, '7zip'],
  [/카카오톡|kakaotalk/, 'kakaotalk'],
  [/알집|alzip/, 'alzip'],
  [/반디뷰|bandiview|꿀뷰/, 'bandiview'],
  [/반디집|bandizip/, 'bandizip'],
  [/반디캠|bandicam/, 'bandicam'],
  [/포토스케이프|photoscape/, 'photoscape'],
  [/copytrans|heic 뷰어/, 'copytrans-heic'],
  [/오토오프|autooff/, 'autooff'],
  [/알캡처|알캡쳐|alcapture/, 'alcapture'],
  [/알pdf|알피디에프|alpdf/, 'alpdf'],
  [/팀뷰어|teamviewer/, 'teamviewer'],
  [/고클린|goclean/, 'goclean'],
  [/스타코덱|starcodec/, 'starcodec'],
  [/곰플레이어/, 'gomplayer'],
  [/곰녹음기/, 'gomrecorder'],
  [/다음팟/, 'daumpot'],
  [/km플레이어|kmplayer/, 'kmplayer'],
  [/디스코드|discord/, 'discord'],
  [/왓츠앱|whatsapp/, 'whatsapp'],
  [/한컴오피스/, 'hancom-office'],
  [/한글\s*20|hwp뷰어|한글과컴퓨터/, 'hangul'],
  [/엑셀|excel/, 'excel'],
  [/한쇼/, 'hanshow'],
  [/스케치업|sketchup/, 'sketchup'],
  [/넷플릭스|netflix/, 'netflix'],
  [/크롬/, 'chrome'],
];

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});
turndown.remove(['script', 'style', 'svg']);

async function fetchJson(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  return response.json();
}

async function fetchAll(resource) {
  const items = [];
  for (let page = 1; page < 20; page += 1) {
    const url = `${WP}/wp-json/wp/v2/${resource}?per_page=100&page=${page}`;
    const response = await fetch(url, { headers: HEADERS });
    if (response.status === 400) break;
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

function decodeHtml(value = '') {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripHtml(value = '') {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function softwareKey(title, slug) {
  const haystack = `${title} ${slug}`.toLowerCase();
  for (const [pattern, key] of KEY_RULES) {
    if (pattern.test(haystack)) return key;
  }
  return slug || title;
}

function guessCategory(title) {
  const t = title.toLowerCase();
  if (/한글|한컴|한쇼|엑셀|excel|hwp|pdf|워드|json|xls/.test(t)) return 'office';
  if (/백신|바이러스|고클린|알약|팀뷰어|드라이버|아이피/.test(t)) return 'security';
  if (/카카오톡|왓츠앱|디스코드|위챗|크롬|엣지|인스타|드롭박스|한메일/.test(t)) {
    return 'internet';
  }
  if (/포토|포토샵|스케치업|꿀뷰|반디뷰|heic|구글어스/.test(t)) return 'graphics';
  if (/플레이어|코덱|녹음|무비|동영상|반디캠/.test(t)) return 'media';
  return 'utility';
}

function pickCategory(ids, title) {
  const mapped = ids.map((id) => CATEGORY_BY_ID[id]).filter(Boolean);
  return mapped[0] ?? guessCategory(title);
}

const DISPLAY_NAMES = {
  '7zip': '7-Zip',
  kakaotalk: '카카오톡',
  alzip: '알집',
  bandiview: '반디뷰',
  bandizip: '반디집',
  bandicam: '반디캠',
  photoscape: '포토스케이프',
  'copytrans-heic': 'CopyTrans HEIC',
  autooff: '오토오프',
  alcapture: '알캡처',
  alpdf: '알PDF',
  teamviewer: '팀뷰어',
  hangul: '한글',
  'hancom-office': '한컴오피스',
  chrome: '크롬',
  discord: '디스코드',
};

function softwareName(title, extracted, key) {
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  if (extracted && extracted.length < 40) return extracted;
  return (
    title
      .replace(/\s*[|\-–].*$/, '')
      .replace(/\s*(다운로드|무료|최신버전|설치|사용법|바로가기|디시).*$/u, '')
      .trim() || title
  );
}

function detectOs(text) {
  const os = [];
  if (/windows|윈도우|win\b/i.test(text)) os.push('windows');
  if (/macos|mac os|맥/i.test(text)) os.push('macos');
  if (/linux|리눅스/i.test(text)) os.push('linux');
  if (/android|안드로이드/i.test(text)) os.push('android');
  if (/\bios\b|아이폰|아이패드/i.test(text)) os.push('ios');
  return [...new Set(os)];
}

function extractTableValue(html, labels) {
  for (const label of labels) {
    const pattern = new RegExp(
      `<t[dh][^>]*>\\s*${label}\\s*</t[dh]>\\s*<t[dh][^>]*>\\s*([^<]+)`,
      'i',
    );
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return '';
}

function extractDownloads(html) {
  const downloads = [];
  const seen = new Set();
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const url = match[1];
    const label = stripHtml(match[2]);
    if (!/^https?:\/\//.test(url) || url.includes('mydownload.co.kr')) continue;
    const osHint = `${label} ${url}`;
    let os = 'windows';
    if (/mac/i.test(osHint)) os = 'macos';
    else if (/android|play\.google/i.test(osHint)) os = 'android';
    else if (/ios|apps\.apple|itunes/i.test(osHint)) os = 'ios';
    else if (/linux/i.test(osHint)) os = 'linux';
    if (!/다운로드|download|공식|홈페이지/i.test(label) && downloads.length > 0) continue;
    const key = `${os}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    downloads.push({
      os,
      label: label || `${os} 다운로드`,
      url,
    });
  }
  return downloads.slice(0, 6);
}

function extractRating(html) {
  const match = html.match(/(\d(?:\.\d)?)\s*\/\s*5/);
  return match ? Number(match[1]) : undefined;
}

function yamlValue(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return JSON.stringify(text);
}

function toYaml(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      if (typeof value[0] === 'object') {
        lines.push(`${key}:`);
        for (const item of value) {
          const keys = Object.keys(item);
          lines.push(`  - ${keys[0]}: ${yamlValue(item[keys[0]])}`);
          for (const nested of keys.slice(1)) {
            lines.push(`    ${nested}: ${yamlValue(item[nested])}`);
          }
        }
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${yamlValue(item)}`);
      }
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${yamlValue(value)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

async function saveImage(url) {
  if (!url || !url.includes('mydownload.co.kr')) return url;
  const parsed = new URL(url);
  const relative = decodeURIComponent(parsed.pathname.replace('/wp-content/uploads/', ''));
  const dest = path.join(ROOT, 'public/uploads', relative);
  const publicPath = `/uploads/${relative.split(path.sep).join('/')}`;
  const served = IMAGE_BASE ? `${IMAGE_BASE}${publicPath}` : publicPath;
  try {
    await access(dest);
    return served;
  } catch {
    // download below
  }
  await mkdir(path.dirname(dest), { recursive: true });
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) return url;
  await writeFile(dest, Buffer.from(await response.arrayBuffer()));
  return served;
}

async function rewriteImages(html) {
  const urls = [...html.matchAll(/src=["']([^"']+)["']/gi)].map((match) => match[1]);
  let next = html;
  for (const url of urls) {
    if (!url.includes('/wp-content/uploads/')) continue;
    const local = await saveImage(url);
    next = next.replaceAll(url, local);
  }
  return next;
}

function cleanHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?div[^>]*>/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

async function main() {
  console.log('Fetching WordPress posts…');
  const [posts, media] = await Promise.all([fetchAll('posts'), fetchAll('media')]);
  const mediaById = new Map(media.map((item) => [item.id, item]));
  await mkdir(path.join(ROOT, 'src/content/software'), { recursive: true });

  const prepared = [];
  for (const post of posts) {
    const title = decodeHtml(post.title.rendered);
    const excerpt = stripHtml(post.excerpt.rendered).slice(0, 180);
    const rawSlug = new URL(post.link).pathname.replace(/^\/entry\//, '').replace(/\/$/, '');
    let entrySlug = rawSlug;
    try {
      entrySlug = decodeURIComponent(rawSlug);
    } catch {
      entrySlug = rawSlug;
    }
    const key = softwareKey(title, entrySlug);
    const html = await rewriteImages(post.content.rendered);
    const developer = extractTableValue(html, ['개발사', '제작사', 'Publisher']);
    const license = extractTableValue(html, ['라이선스', 'License']);
    const extractedName = extractTableValue(html, ['소프트웨어', '프로그램명', '프로그램', 'Name']);
    const downloads = OFFICIAL_DOWNLOADS[key] ?? extractDownloads(html);
    const featuredMedia = mediaById.get(post.featured_media);
    const icon = featuredMedia?.source_url
      ? await saveImage(featuredMedia.source_url)
      : undefined;
    const os = detectOs(`${html} ${downloads.map((item) => item.os).join(' ')}`);
    const body = turndown.turndown(cleanHtml(html)).trim();

    prepared.push({
      title,
      name: softwareName(title, extractedName, key),
      category: pickCategory(post.categories, title),
      os,
      developer,
      license,
      rating: extractRating(html),
      downloads,
      icon,
      excerpt,
      date: post.date,
      updated: post.modified,
      tags: [],
      entrySlug,
      legacyPath: `/entry/${entrySlug}/`,
      softwareKey: key,
      legacyId: post.id,
      body,
    });
    console.log(`converted ${post.id} ${title}`);
  }

  const groups = Map.groupBy(prepared, (item) => item.softwareKey);
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const [canonical, ...dupes] = sorted;
    canonical.featured = FEATURED_KEYS.has(canonical.softwareKey);
    canonical.hiddenFromList = false;
    for (const dupe of dupes) {
      dupe.hiddenFromList = true;
      dupe.canonical = canonical.legacyPath;
      dupe.featured = false;
    }
  }

  for (const item of prepared) {
    const { body, ...frontmatter } = item;
    const file = path.join(ROOT, 'src/content/software', `${item.legacyId}.md`);
    await writeFile(file, `${toYaml(frontmatter)}${body}\n`);
  }

  console.log(`Wrote ${prepared.length} markdown files.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
