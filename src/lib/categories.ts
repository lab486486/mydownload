export const categories = [
  {
    slug: 'utility',
    name: '유틸리티',
    code: '01',
    tone: 'manila',
    description: '압축, 캡처, 변환처럼 매일 쓰는 도구',
    wpSlugs: ['유틸리티', '%ec%9c%a0%ed%8b%b8%eb%a6%ac%ed%8b%b0'],
  },
  {
    slug: 'office',
    name: '문서편집',
    code: '02',
    tone: 'sage',
    description: '한글, 오피스, PDF 뷰어와 편집기',
    wpSlugs: ['문서편집', '%eb%ac%b8%ec%84%9c%ed%8e%b8%ec%a7%91'],
  },
  {
    slug: 'media',
    name: '동영상/오디오',
    code: '03',
    tone: 'sky',
    description: '플레이어, 코덱, 녹화와 변환',
    wpSlugs: ['동영상-오디오', '%eb%8f%99%ec%98%81%ec%83%81-%ec%98%a4%eb%94%94%ec%98%a4'],
  },
  {
    slug: 'security',
    name: 'PC관리/보안',
    code: '04',
    tone: 'clay',
    description: '백신, 원격, 드라이버와 시스템 도구',
    wpSlugs: ['pc관리-보안', 'pc%ea%b4%80%eb%a6%ac-%eb%b3%b4%ec%95%88'],
  },
  {
    slug: 'internet',
    name: '인터넷/통신',
    code: '05',
    tone: 'lilac',
    description: '메신저, 브라우저, 클라우드',
    wpSlugs: ['인터넷-통신', '%ec%9d%b8%ed%84%b0%eb%84%b7-%ed%86%b5%ec%8b%a0'],
  },
  {
    slug: 'graphics',
    name: '이미지/그래픽',
    code: '06',
    tone: 'peach',
    description: '뷰어, 편집, 캡처와 변환',
    wpSlugs: ['이미지-그래픽', '%ec%9d%b4%eb%af%b8%ec%a7%80-%ea%b7%b8%eb%9e%98%ed%94%bd'],
  },
] as const;

export type CategorySlug = (typeof categories)[number]['slug'];

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function categoryPath(slug: string) {
  return `/category/${slug}/`;
}
