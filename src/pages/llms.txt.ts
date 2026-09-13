import type { APIRoute } from 'astro';
import { site } from '../data/site';
import { categories, categoryPath } from '../lib/categories';
import { entryPath, getListedSoftware } from '../lib/software';

export const GET: APIRoute = async () => {
  const entries = await getListedSoftware();
  const lines = [
    '# 마이 다운로드',
    '',
    site.description,
    '',
    '설치 파일은 보관하지 않습니다. 제작사 공식 다운로드 경로만 안내합니다.',
    '',
    '## 사이트',
    `- [홈](${site.url}/)`,
    `- [검색](${site.url}/search/)`,
    `- [RSS](${site.url}/rss)`,
    `- [사이트맵](${site.url}/sitemap.xml)`,
    `- [개인정보처리방침](${site.url}/privacy/)`,
    '',
    '## 카테고리',
    ...categories.map(
      (category) => `- [${category.name}](${site.url}${categoryPath(category.slug)})`,
    ),
    '',
    '## 자료',
    ...entries.slice(0, 40).map((entry) => `- [${entry.data.name}](${site.url}${entryPath(entry)})`),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};
