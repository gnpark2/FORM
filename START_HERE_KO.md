# 먼저 읽어주세요 — FORM 전체 프로젝트

이 ZIP은 변경된 전체 소스입니다. 기존 프로젝트 위에 덮어쓰지 말고 새 폴더에 풀어 시작하세요.
Node.js 백엔드 + Next.js + Supabase Auth/PostgreSQL/Storage 버전입니다.
기존 보드, 사진 편집, 옷장, 저장·삭제 및 추천 기능이 포함되어 있습니다.

## 1. 준비

- Node.js 24.x 설치
- pnpm 11.25.0 사용 (이미 설치했다면 다시 설치할 필요 없음)
- Supabase 프로젝트 및 Google OAuth 설정

```bash
node -v
pnpm -v
```

pnpm이 없다면:

```bash
npm install -g pnpm@11.25.0
```

## 2. 환경변수

압축을 푼 폴더의 package.json과 같은 위치에서 실행합니다.

```bash
cp .env.example .env.local
```

.env.local의 다음 항목을 실제 값으로 바꿉니다.

- APP_ORIGIN=http://localhost:5173
- SUPABASE_URL: Supabase 프로젝트 URL
- SUPABASE_PUBLISHABLE_KEY: Supabase API Keys 화면의 publishable key
- DATABASE_URL: Connect → Transaction pooler의 연결 문자열 (6543 포트)
- SUPABASE_STORAGE_BUCKET=wardrobe

DB 연결 문자열의 비밀번호 자리도 바꿉니다. 비밀번호의 특수문자는 URL 인코딩이 필요합니다.
.env.local에는 비밀값이 들어가므로 GitHub나 채팅에 업로드하지 마세요.

## 3. Google 로그인

기존 Google OAuth 클라이언트를 재사용할 수 있습니다.
Google Cloud의 승인된 리디렉션 URI에 다음 주소를 추가합니다.

https://프로젝트ID.supabase.co/auth/v1/callback

Supabase Authentication → Google Provider에 Google Client ID와 Secret을 입력하고 활성화합니다.
Supabase Authentication → URL Configuration:

- Site URL: http://localhost:5173
- Redirect URLs: http://localhost:5173/api/auth/callback

Google에 등록하는 주소와 Supabase에 등록하는 주소는 서로 다릅니다.

## 4. 설치 및 실행

```bash
pnpm install --frozen-lockfile
pnpm check:env
pnpm db:migrate
pnpm dev
```

환경변수 점검에서 모두 set인지 확인한 뒤 migration을 실행하세요.
이 migration은 Supabase의 테이블, RLS 정책과 비공개 wardrobe 버킷을 만듭니다.
테이블/버킷을 미리 수동으로 만들거나 예전 drizzle SQL을 실행하지 마세요.

브라우저에서 http://localhost:5173 을 열고 Google 로그인 후 사진 등록·코디 저장을 확인합니다.

## 5. Vercel 배포

전체 안내는 README.md의 Vercel 및 Supabase 연결 항목을 참고하세요.
GitHub 연결이나 Vercel CLI 중 사용할 배포 방법에 맞춰 진행할 수 있습니다.
Framework: Next.js / Node.js: 24.x / Build: pnpm build
운영 환경에는 APP_ORIGIN을 실제 운영 도메인으로 등록하고 재배포합니다.
Supabase Redirect URLs에도 https://운영도메인/api/auth/callback을 추가합니다.

## 현재 상태와 데이터

- 코드 테스트 35개 및 Next.js 프로덕션 빌드 통과.
- Google/Supabase 실제 계정 연결과 운영 배포는 사용자 환경변수 등록 후 확인해야 합니다.
- 이전 Google 계정 식별자와 Supabase UUID가 달라 이전 옷장 데이터는 자동 이전되지 않습니다.
- 기존 프로젝트·DB·사진은 새 환경의 데이터 이전을 확인할 때까지 보관하세요.
- 기존 AI는 CF_AI_ACCOUNT_ID, CF_AI_TOKEN 설정 시 사용합니다. 미설정 시 기본 조합으로 표시됩니다.
- AI 사진 자동 분석은 아직 포함되지 않았습니다. 현재는 옷 이름과 입력한 특징을 사용합니다.
- node_modules, .next, 실제 환경변수, 사용자 DB/사진, Git 기록은 포함하지 않았습니다.
- 과거 Cloudflare/Vinext 관련 파일은 소스 기록으로 남아 있으나 현재 실행은 Next.js/Node.js입니다.

핵심 파일: public/app.js, server/auth.js, server/database.js, server/runtime.js,
server/storage.js, server/recommend.js, supabase/migrations/202610220001_form.sql
