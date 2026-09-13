export const site = {
  name: '마이 다운로드',
  tagline: '공식 경로로 받는 소프트웨어 자료실',
  description:
    '한글, 압축, 백신, 드라이버처럼 자주 찾는 프로그램을 공식 다운로드 경로와 함께 정리한 자료실입니다.',
  url: 'https://mydownload.co.kr',
  imageBase: import.meta.env.PUBLIC_IMAGE_BASE ?? '',
};

export const popularQueries = [
  { label: '압축해제', query: '압축' },
  { label: '백신', query: '백신' },
  { label: 'PDF뷰어', query: 'PDF' },
  { label: '한컴오피스', query: '한컴' },
  { label: '알집', query: '알집' },
];

export const officialStores = [
  { name: 'MS 스토어', href: 'https://apps.microsoft.com/' },
  { name: '크롬 웹스토어', href: 'https://chromewebstore.google.com/' },
  { name: '구글 플레이', href: 'https://play.google.com/store' },
  { name: '애플 앱스토어', href: 'https://www.apple.com/kr/app-store/' },
];

export const driverLinks = {
  hardware: [
    { name: '삼성전자 고객지원', href: 'https://www.samsung.com/sec/support/' },
    { name: 'LG전자 다운로드', href: 'https://www.lge.co.kr/support' },
    { name: 'NVIDIA 드라이버', href: 'https://www.nvidia.com/Download/index.aspx' },
    { name: 'AMD 라데온 드라이버', href: 'https://www.amd.com/ko/support' },
    { name: '인텔 드라이버', href: 'https://www.intel.co.kr/content/www/kr/ko/download-center/home.html' },
  ],
  printer: [
    { name: 'HP 프린터 고객지원', href: 'https://support.hp.com/kr-ko' },
    { name: '캐논코리아 다운로드', href: 'https://www.canon-ci.co.kr/support' },
    { name: '한국엡손 고객지원', href: 'https://www.epson.co.kr/support' },
    { name: '브라더 프린터', href: 'https://www.brother.co.kr/support' },
    { name: '신도리코 다운로드', href: 'https://www.sindoh.com/customer/download' },
  ],
  developer: [
    { name: 'GitHub', href: 'https://github.com/' },
    { name: 'SourceForge', href: 'https://sourceforge.net/' },
    { name: '아파치 재단', href: 'https://www.apache.org/' },
    { name: 'Visual Studio', href: 'https://visualstudio.microsoft.com/' },
    { name: 'Java 다운로드', href: 'https://www.oracle.com/java/technologies/downloads/' },
  ],
};
