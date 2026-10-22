# FORM — Node.js / Vercel / Supabase

옷 사진을 등록하고 보드에서 조합·크기·회전을 편집한 뒤 저장하는 개인 옷장 서비스입니다.

## 구성

- Next.js 서버의 **Node.js runtime**이 Google 인증 확인, 옷장/코디 CRUD, 소유권 검사, AI 추천을 처리합니다.
- Supabase Auth: Google 가입/로그인, PKCE, 서버 전용 HttpOnly 쿠키. 브라우저 Supabase SDK는 사용하지 않습니다.
- Supabase PostgreSQL: `pg` 드라이버, JSONB 코디, 사용자별 RLS, 트랜잭션, 동시 저장 충돌 처리.
- Supabase Storage: `wardrobe` 비공개 버킷, 사용자 UUID로 시작하는 경로, 소유자 접근 정책.
- 화면은 현재 검증된 `public/app.js` 및 HTML 보드를 유지합니다. 전체 React 화면 재작성은 이 전환에 포함하지 않았습니다.
- AI는 기존 Cloudflare REST 호출을 유지하며 Vercel의 Node.js에서 실행합니다. 모델 키가 없거나 한도/오류 발생 시 **기본 조합**이라고 표시합니다. 사진 자동 분석은 아직 포함하지 않았습니다.

## 먼저 알아둘 점

이 브랜치는 기존 Cloudflare/D1 및 Turso/R2 버전의 배포물을 대체합니다. `wrangler` 명령이나 예전 SQLite SQL을 Supabase에서 실행하지 마세요. Supabase용 신규 SQL은 `supabase/migrations`에 있습니다. 과거 `drizzle` 폴더는 이전 데이터 구조를 확인하는 기록입니다.

이전 Google 사용자 ID(`google_<sub>`)와 Supabase UUID는 다릅니다. 같은 Google 계정으로 로그인해도 이전 옷장이 자동으로 이전되지는 않습니다. 기존 DB/사진을 백업한 뒤, 검증한 사용자 매핑과 함께 데이터를 변환·복사해야 합니다. 기존 서비스를 지우기 전에 새 환경에서 사용자별 사진/코디를 확인하세요. 이 브랜치는 기존 원격 데이터를 변경하지 않습니다.

## Vercel 및 Supabase 연결

1. Vercel에 `form-outfit-studio` 프로젝트를 연결합니다. Framework는 Next.js, Node.js는 24.x, Build Command는 `pnpm build`입니다.
2. 프로젝트 Storage/Marketplace에서 Supabase를 연결합니다. 신규 소규모 테스트는 Free로 시작할 수 있습니다. 기존 Supabase 프로젝트가 있으면 그것을 연결하세요. 한국 사용자 중심이면 가까운 지역을 선택합니다.
3. Supabase 프로젝트의 Connect 화면에서 **Transaction pooler (6543)** 연결 문자열을 가져옵니다. 비밀번호 특수문자는 URL 인코딩해야 합니다. TLS 인증서 검증을 비활성화하지 마세요.
4. 아래 환경변수를 Vercel의 Development에 등록합니다. Production/Preview는 각각 사용할 DB 및 도메인으로 별도 설정합니다. 운영 DB를 테스트 Preview와 공유하지 않는 편이 좋습니다.

```dotenv
APP_ORIGIN=http://localhost:5173
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
DATABASE_URL=postgresql://postgres.YOUR_PROJECT:YOUR_PASSWORD@YOUR_POOLER_HOST:6543/postgres?sslmode=verify-full
SUPABASE_STORAGE_BUCKET=wardrobe
```

기존 프로젝트의 `anon` 키도 SDK에서 사용할 수 있지만 새 프로젝트는 publishable 키를 사용하세요. Marketplace가 `NEXT_PUBLIC_SUPABASE_URL` 등을 자동 생성했다면 서버가 읽는 위 이름으로 대응하여 추가합니다. `DATABASE_URL`은 서버 비밀값입니다. `NEXT_PUBLIC_` 접두사를 붙이거나 채팅에 공유하지 마세요. 서비스 역할 키(service role)는 이 구현에 필요하지 않습니다.

Vercel CLI가 설치되어 있다면 프로젝트를 연결하고 환경변수를 가져옵니다.

```bash
vercel link
vercel env pull .env.local
pnpm install --frozen-lockfile
pnpm check:env
pnpm db:migrate
pnpm dev
```

`pnpm db:migrate`는 DB 소유자 권한으로 새 테이블, 제한된 `form_api` 역할, RLS, 사진 버킷/정책을 한 트랜잭션에서 생성합니다. 성공한 SQL의 체크섬을 기록하므로 다시 실행해도 중복 적용하지 않습니다. 적용한 SQL은 수정하지 말고 새 migration을 추가하세요. 이 명령을 `build`에 넣지 마세요.

기존 파일을 이미 SQL Editor에서 수동 적용했다면 자동 migration과 혼용하지 마세요. 먼저 기존 스키마/기록을 확인해야 합니다.

## Google 로그인 설정 변경

Google Client ID/Secret은 이제 애플리케이션 `.env.local` 대신 **Supabase → Authentication → Providers → Google**에 설정합니다.

Google Cloud OAuth 클라이언트의 Authorized redirect URI:

```text
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

Supabase → Authentication → URL Configuration:

- Site URL: 운영 서비스 주소
- Redirect URLs: `http://localhost:5173/api/auth/callback`
- Redirect URLs: `https://운영도메인/api/auth/callback`

운영 Vercel의 `APP_ORIGIN`은 `https://운영도메인`으로 설정합니다. Preview에서 Google 로그인을 테스트하려면 고정된 Preview 주소를 등록하고 그 환경의 `APP_ORIGIN`도 맞춥니다. 광범위한 와일드카드 URL은 사용하지 않습니다.

Google → Supabase 콜백과 Supabase → FORM 콜백은 서로 다릅니다. 예전 Google OAuth 설정의 FORM 직접 콜백만으로는 새 로그인이 동작하지 않습니다.

## AI

기존 AI를 사용하려면 서버 환경에 `CF_AI_ACCOUNT_ID`, `CF_AI_TOKEN`을 설정합니다. 계정별 하루 5회, 서비스 전체 하루 50회 시도 제한이며 한국 시간 자정에 초기화됩니다. 실패한 유료 요청도 시도로 계산합니다. 동일 입력/옷장 결과는 재사용합니다.

한도 예약은 DB 전역 잠금이 있는 짧은 트랜잭션에서 수행하고 AI 네트워크 응답을 기다리는 동안 DB 연결을 잡고 있지 않습니다. 결과의 옷 ID, 종류, 고정 아이템을 서버에서 검증합니다. 모델은 입력된 이름·특징만 보며, 사진 분석이나 실제 핏 판단을 하지 않습니다.

## 파일별 수정 위치

| 파일 | 담당 |
|---|---|
| `app/api/[...path]/route.ts` | Node.js API 진입, 응답 쿠키 반영 |
| `server/auth.js` | Google 시작/콜백/로그아웃, Supabase `getUser()` 검증 |
| `server/database.js` | PostgreSQL 연결 풀, 사용자 RLS 컨텍스트, 트랜잭션 |
| `server/runtime.js` | 요청별 Supabase SDK, 사진 접근, 저장 실패 보상 |
| `server/storage.js` | 입력 검증, 옷/코디/초안 CRUD |
| `server/recommend.js` | AI 추천, 캐시, 예산 예약, 결과 검증 |
| `supabase/migrations/202610220001_form.sql` | PostgreSQL 테이블과 접근 정책 |
| `scripts/migrate-supabase.mjs` | migration 실행/체크섬 기록 |

앱 테이블은 브라우저의 anon/authenticated 역할로 직접 조회·수정할 수 없습니다. Node.js는 검증한 사용자 ID를 트랜잭션 내부에 설정하고 제한된 `form_api` 역할로 쿼리합니다. 명시적인 사용자 필터와 RLS를 함께 적용합니다.

사진 파일과 PostgreSQL은 분산 트랜잭션을 지원하지 않습니다. 업로드 후 DB 저장이 실패하면 사진 삭제를 시도하고, 삭제 요청의 사진 정리는 DB 커밋 이후 실행합니다. 네트워크 장애/프로세스 강제 종료로 고아 파일이 남을 수 있어 로그의 `Orphan photo cleanup required`는 운영 점검 대상입니다.

## 확인

```bash
pnpm test
pnpm check
pnpm build
```

테스트는 PGlite(PostgreSQL 엔진)에서 실제 migration과 RLS를 실행합니다. Google/Supabase HTTP와 AI 응답은 모의 응답을 사용하며 실제 계정 접속 검증을 대체하지 않습니다.

배포 전 연결된 실제 환경에서 다음을 확인하세요: Google 로그인 → 옷 사진 등록/조회 → 보드 크기/회전 → 코디 저장 → 새로고침 → 다른 계정에서 비공개 확인 → 코디/옷 삭제 → 로그아웃. 실제 서비스 키가 없는 상태에서는 이 온라인 검증을 완료할 수 없습니다.
