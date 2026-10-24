FORM 보드 선택 해제 · 저장 위치 · 사용자 하위 분류 업데이트

기준: gnpark2/FORM main fa6213d83c53c187d9a25519886629f51abf92de (2026-10-23)

1. ZIP을 풀어 form-board-subcategory-update 폴더를 package.json 옆에 놓습니다.
2. 프로젝트 루트의 Git Bash에서 실행합니다.

   node form-board-subcategory-update/apply.mjs

   파일이 기준 버전과 다르면 아무 파일도 변경하지 않고 중단합니다.
   이미 적용한 파일은 건너뜁니다. .env.local은 읽거나 변경하지 않습니다.

3. 로컬 .env.local의 DATABASE_URL이 현재 운영 Supabase를 가리키는지 확인하고 실행합니다.

   pnpm db:migrate
   pnpm check
   pnpm test
   pnpm build

   기존 마이그레이션은 건너뛰고 202610240001_subcategories.sql만 추가 적용합니다.
   기존 옷의 하위 분류는 빈 배열로 시작하며 사진과 코디는 보존됩니다.
   DB 변경은 기존 운영 코드와 호환됩니다. 새 코드 배포 전에 DB를 먼저 적용하세요.
   실패하면 다음 단계로 진행하지 말고 오류를 확인하세요.

4. pnpm dev로 로컬 확인 후 다음 파일만 커밋/푸시합니다.

   git add app/studio.html package.json public/app.js public/closet.js public/recommend-ui.js public/style.css public/subcategories.js server/storage.js server/subcategories.js supabase/migrations/202610240001_subcategories.sql tests/postgres-helper.js tests/subcategories.test.js
   git commit -m "Improve outfit board and add custom subcategories"
   git push origin main

   Vercel 자동 배포가 Ready가 되면 운영 사이트를 새로고침합니다.
   환경변수나 Google 로그인 설정은 변경하지 않습니다.
   적용이 끝난 form-board-subcategory-update 폴더는 삭제해도 됩니다.

사용법
- 보드 빈 곳 또는 선택 조절 영역 밖을 누르거나 Escape를 누르면 테두리/핸들이 사라집니다.
- 크기/회전 조절 중에는 선택이 유지됩니다. 옷은 보드에서 삭제되지 않습니다.
- 코디 저장 버튼은 보드 바로 아래에 있습니다.
- 내 옷장 > 하위 분류 만들기 · 관리에서 상의/하의 등을 선택하고 분류를 만듭니다.
- 옷 등록 및 정보 수정에서도 분류를 만들고 여러 개 선택할 수 있습니다.
- 종류당 최대 30개 분류, 옷마다 최대 12개 선택입니다.
- 전체에서는 상의 · 여름 / 하의 · 여름처럼 부모 종류와 함께 표시됩니다.
- 분류 삭제는 분류 연결만 해제합니다. 사진/코디는 유지됩니다.
- 다른 계정에서는 본인 분류만 보입니다.
- 추천의 포함할 옷은 최근 선택한 옷으로 유지되며 이름이 표시됩니다.

검증: 자동화 테스트 46개, 문법 검사, Next.js 배포 빌드 통과.
DOM 상호작용 확인: 선택 해제, 조절 유지, Escape, 추천 기준 옷, 저장 위치,
전체/종류 필터, 분류 생성/복수 선택/수정 저장/삭제.
제한: 관리형 미리보기 도구와 Next.js 실행 옵션이 맞지 않아 실제 모바일 화면 검증은 미실시.
