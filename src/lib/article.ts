const LABEL_RULES: [RegExp, string][] = [
  [/^앱\s*카테고리$|^카테고리$/, '카테고리'],
  [/^운영체제(\s*\(?OS\)?)?$|^지원\s*운영체제$|^지원운영체제$|^지원\s*OS$|^OS$/i, '운영체제'],
  [/^다운로드\s*파일/, '파일'],
  [/^파일\s*크기\s*\/\s*RAM$/i, '파일 크기 / RAM'],
  [/^파일\s*크기$|^파일크기$|^설치파일\s*크기$/, '파일 크기'],
  [/^용량$/, '용량'],
  [/^메모리(\s*\(.+\))?$|^메모리\s*요구|^사용\s*환경$|^RAM$/i, '메모리'],
  [/^RAM\s*\/\s*HDD$/i, '메모리'],
  [/^설치\s*공간$|^설치공간$|^디스크$|^하드\s*디스크$|^저장\s*공간$|^저장공간|^여유\s*저장|^그외\s*\(?저장/, '저장 공간'],
  [/^설치\s*파일$|^설치파일$|^설치파일명$/, '설치 파일'],
  [/^개발사$|^제작사$|^개발자$/, '개발사'],
  [/^라이선스$|^라이센스$/, '라이선스'],
  [/^언어지원$|^언어$/, '언어'],
  [/^홈페이지$|^공식\s*사이트$|^공식\s*홈페이지$/, '홈페이지'],
  [/^최신버전$|^버전$/, '버전'],
  [/^프로세서$|^CPU$/i, '프로세서'],
  [/^CPU\s*기능$/i, 'CPU 기능'],
  [/^그래픽\s*카드\s*기능$/, '그래픽 기능'],
  [/^권장\s*그래픽\s*설정$/, '그래픽 설정'],
  [/^그래픽\s*카드$|^그래픽카드$|^그래픽$/, '그래픽'],
  [/^DirectX$/i, 'DirectX'],
  [/^인터넷\s*연결$/, '인터넷'],
  [/^네트워크$/, '네트워크'],
  [/^해상도$/, '해상도'],
  [/^무게$/, '무게'],
  [/^업데이트$/, '업데이트'],
  [/^이용\s*가능\s*연령$|^이용\s*연령$/, '이용 연령'],
];

const SKIP_LABELS = /^(구분|내용|항목|비고|최소사양|권장사양|권장\s*사양|권장\s*시스템\s*사양|앱\s*이름)$/;
const CONTINUATION = /^(NVIDIA|GeForce|Radeon|Core|최소|Shader|Intel|AMD|ARM|DirectX)/i;
const SPEC_ORDER = [
  '프로그램',
  '카테고리',
  '개발사',
  '라이선스',
  '운영체제',
  '파일',
  '설치 파일',
  '파일 크기',
  '파일 크기 / RAM',
  '용량',
  '프로세서',
  'CPU 기능',
  '메모리',
  '저장 공간',
  '그래픽',
  '그래픽 기능',
  '그래픽 설정',
  'DirectX',
  '해상도',
  '인터넷',
  '네트워크',
  '언어',
  '버전',
  '업데이트',
  '무게',
  '이용 연령',
  '홈페이지',
];

function stripDecor(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\\(?=[_.*])/g, '')
    .replace(/[*_`>#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const FILE_HOST = /drive\.google\.com|dropbox\.com|mediafire\.com|mega\.nz|onedrive\.live\.com|1drv\.ms/i;

function homepageValue(raw: string) {
  const link = raw.match(/\[([^\]]+)\]\((https?:[^)\s]+)\)/);
  const href = link?.[2] ?? stripDecor(raw);
  if (!/^https?:\/\//i.test(href) || FILE_HOST.test(href)) return '';
  try {
    return new URL(href).origin;
  } catch {
    return href.length > 60 ? '' : href;
  }
}

function cleanValue(raw: string, label: string) {
  if (label === '홈페이지') return homepageValue(raw);
  return stripDecor(raw);
}

function looksLikeSpecValue(value: string) {
  if (!value) return false;
  if (/[0-9].{0,12}(MB|GB|KB|RAM|Hz|비트|GHz)/i.test(value)) return true;
  if (/상이할 수/.test(value)) return true;
  if (/(입니다|습니다|됩니다|하세요|할까요|해보세요)/.test(value) && value.length > 36) return false;
  return value.length <= 110;
}

function canonicalLabel(raw: string) {
  const cleaned = stripDecor(raw);
  if (!cleaned || SKIP_LABELS.test(cleaned)) return null;
  for (const [pattern, label] of LABEL_RULES) {
    if (pattern.test(cleaned)) return label;
  }
  return null;
}

function isContinuation(previous: string, next: string, label: string, mode: 'pair' | 'twocol') {
  if (canonicalLabel(next) || SKIP_LABELS.test(stripDecor(next))) return false;
  const prev = stripDecor(previous);
  const nxt = stripDecor(next);
  if (!nxt) return false;
  if (/[,，、]$/.test(prev)) return true;
  if (/^\(/.test(nxt) && /그래픽|메모리|프로세서|해상도/.test(label)) return true;
  if (mode === 'twocol') return false;
  return /그래픽|DirectX|해상도/.test(label) && CONTINUATION.test(nxt);
}

function takeValue(lines: string[], start: number, label: string, mode: 'pair' | 'twocol' = 'pair') {
  if (start >= lines.length || canonicalLabel(lines[start])) return { value: '', next: start };
  let value = cleanValue(lines[start], label);
  let index = start;
  while (index + 1 < lines.length && isContinuation(lines[index], lines[index + 1], label, mode)) {
    index += 1;
    value = `${value} ${cleanValue(lines[index], label)}`.replace(/\s+/g, ' ').trim();
  }
  return { value, next: index + 1 };
}

function splitCombined(label: string, value: string) {
  if (label === '파일 크기 / RAM') {
    const parts = value.split(/\s*\/\s*/);
    if (parts.length >= 2) {
      return [
        { label: '파일 크기', value: parts[0].trim() },
        { label: '메모리', value: parts.slice(1).join(' / ').trim() },
      ];
    }
  }
  if (label === '메모리' && /메모리/.test(value) && value.length < 40) {
    return [{ label, value }];
  }
  return [{ label, value }];
}

function remember(found: Map<string, string>, label: string, value: string, overwrite = false) {
  for (const row of splitCombined(label, value)) {
    if (!row.value || !looksLikeSpecValue(row.value)) continue;
    if (found.has(row.label) && !overwrite) continue;
    found.set(row.label, row.value);
  }
}

export function extractBodySpecs(body: string) {
  const found = new Map<string, string>();
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!['));

  const twoCol = lines.some((line) => /^최소사양$/.test(stripDecor(line)))
    && lines.some((line) => /^권장사양$/.test(stripDecor(line)));

  let index = 0;
  while (index < lines.length) {
    const inline = stripDecor(lines[index]).match(/^(.{2,16}?)\s*[:：]\s+(.+)$/);
    if (inline) {
      const label = canonicalLabel(inline[1]);
      const value = cleanValue(inline[2], label ?? '');
      if (label && value) remember(found, label, value);
      index += 1;
      continue;
    }

    const label = canonicalLabel(lines[index]);
    if (!label) {
      index += 1;
      continue;
    }

    let run = 1;
    while (index + run < lines.length && canonicalLabel(lines[index + run])) run += 1;

    if (run >= 3) {
      const labels = Array.from({ length: run }, (_, offset) => canonicalLabel(lines[index + offset])!);
      let cursor = index + run;
      let paired = 0;
      for (const item of labels) {
        const taken = takeValue(lines, cursor, item);
        if (!taken.value || canonicalLabel(lines[cursor] ?? '')) break;
        remember(found, item, taken.value);
        cursor = taken.next;
        paired += 1;
      }
      if (paired >= 2) {
        index = cursor;
        continue;
      }
    }

    if (twoCol) {
      const values: string[] = [];
      let cursor = index + 1;
      while (
        cursor < lines.length
        && values.length < 8
        && !canonicalLabel(lines[cursor])
        && !SKIP_LABELS.test(stripDecor(lines[cursor]))
      ) {
        const taken = takeValue(lines, cursor, label, 'twocol');
        if (!taken.value || !looksLikeSpecValue(taken.value)) break;
        values.push(taken.value);
        cursor = taken.next;
      }
      if (values.length >= 2 && values.length % 2 === 0) {
        const mid = values.length / 2;
        remember(
          found,
          label,
          `최소 ${values.slice(0, mid).join(' ')} / 권장 ${values.slice(mid).join(' ')}`,
          true,
        );
        index = cursor;
        continue;
      }
    }

    const taken = takeValue(lines, index + 1, label);
    if (taken.value && !canonicalLabel(lines[index + 1] ?? '')) {
      remember(found, label, taken.value);
      index = taken.next;
      continue;
    }

    index += 1;
  }

  return [...found.entries()].map(([label, value]) => ({ label, value }));
}

export function orderedSpecRows(rows: { label: string; value: string }[]) {
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    if (!row.value || seen.has(row.label)) return false;
    seen.add(row.label);
    return true;
  });
  return unique.sort((a, b) => {
    const left = SPEC_ORDER.indexOf(a.label);
    const right = SPEC_ORDER.indexOf(b.label);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
  });
}
