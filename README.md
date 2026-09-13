# 마이 다운로드

워드프레스 `mydownload.co.kr`을 Astro + GitHub + Cloudflare Pages/R2로 옮긴 소프트웨어 자료실입니다. 설치 파일은 호스팅하지 않고 공식 사이트만 안내합니다.

새 글은 워드프레스처럼 본문을 직접 쓰지 않습니다. `/admin/`에 프로그램 이름과 공식 주소만 넣으면 대기 파일이 생기고, GitHub Action이 DeepSeek로 `src/content/software/*.md`를 만든 뒤 Cloudflare가 뿌립니다.

## 로컬 실행

```bash
npm install
npm run migrate   # 워드프레스에서 글/이미지 가져오기
npm run dev
```

- 사이트: http://localhost:4321
- 관리자(글 지시): http://localhost:4321/admin/ — 공개 메뉴에는 없습니다. `npm run dev`가 켜져 있어야 저장됩니다.
- Decap CMS(기존 글 직접 수정): 다른 터미널에서 `npm run cms` 후 http://localhost:4321/admin/cms/

## 콘텐츠

- 글: `src/content/software/*.md`
- 작성 지시: `src/content/queue/*.md` (`status: pending`)
- 이미지: `public/uploads/` (마이그레이션 결과)
- 홈 링크/스토어: `src/data/site.ts`

중복 글은 모두 유지합니다. 최신 글만 목록에 보이고, 이전 글은 `canonical`로 최신 글을 가리킵니다.

## 다운로드 글 작성 흐름

1. `/admin/`에서 프로그램 이름, 카테고리, 공식 다운로드 주소(하나 이상), 아이콘을 넣습니다.
2. `src/content/queue/{이름}.md`가 `status: pending`으로 저장됩니다.
3. 이 파일을 GitHub에 올리면 `Publish software` 워크플로가 DeepSeek로 본문을 씁니다.
4. 생성된 마크다운이 커밋되고, Cloudflare Pages가 다시 빌드합니다.

로컬에서만 시험하려면 `.env`에 `DEEPSEEK_API_KEY`를 넣고 다음을 실행합니다.

```bash
pip install -r scripts/requirements.txt
python3 scripts/publish_software.py --max-posts 1
```

설치 파일 URL은 대기 지시에 적은 공식 주소만 쓰고, 본문에는 다운로드 버튼을 넣지 않습니다. 버튼은 상세 페이지 오른쪽 카드가 붙입니다.

GitHub Secrets:

- `DEEPSEEK_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

선택 변수 `DEEPSEEK_MODEL`(기본 `deepseek-v4-flash`). Cloudflare Pages 프로젝트 이름은 워크플로의 `mydownload`와 같게 맞춥니다.

## Cloudflare Pages

1. 이 저장소를 GitHub에 올립니다.
2. Cloudflare Pages에서 프레임워크 `Astro`, 빌드 명령 `npm run build`, 출력 `dist`로 연결합니다.
3. 도메인 `mydownload.co.kr`을 Pages에 붙입니다.

`public/_redirects`가 예전 카테고리 URL을 새 경로로 보냅니다. 글 URL은 기존과 같이 `/entry/{slug}/`입니다.

## R2 이미지

이미지는 우선 `public/uploads`에 둡니다. 프로덕션에서 R2를 쓰려면:

1. 버킷을 만들고 공개 도메인(예: `img.mydownload.co.kr`)을 붙입니다.
2. `public/uploads`를 버킷 루트에 올립니다.

```bash
npx wrangler r2 object put mydownload-images/uploads/2026/06/example.jpg --file=public/uploads/2026/06/example.jpg
```

3. Pages 환경 변수 `PUBLIC_IMAGE_BASE=https://img.mydownload.co.kr`를 넣은 뒤 `npm run migrate`를 다시 실행하면 본문 이미지 URL이 CDN을 가리킵니다.

Decap에서 새로 올리는 이미지도 `public/uploads`로 들어갑니다. 배포 파이프라인에서 이 폴더를 R2에 동기화하면 됩니다.

## Decap CMS + GitHub

`public/admin/config.yml`의 `repo`를 실제 `계정/저장소`로 바꿉니다. GitHub OAuth 앱과 Cloudflare Worker 같은 인증 프록시가 필요합니다. 로컬에서는 `local_backend: true`와 `npm run cms`만으로 편집할 수 있습니다.
