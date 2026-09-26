# 아버지의 기록

자서전을 준비하며, 연대별 기억과 소재를 모읍니다. Markdown 자료를 GitHub에 올리면 가족이 앱 설치나 회원가입 없이 읽을 수 있는 모바일 사이트로 배포됩니다. VitePress와 GitHub Pages로 본문을 제공하며, Firebase 댓글은 추후 연결할 예정입니다.

첫 화면의 연대별 목록에서 이야기를 골라 읽습니다. 읽기 화면 상단에는 목록과 글자 크기만 둡니다. 같은 브라우저에서는 세 단계 글자 크기와 읽던 위치를 기억하여 이어 읽을 수 있습니다. 본문 목차, 검색·필터, 카드 장식, 하단 도구 모음, 예상 읽기 시간과 진행률은 표시하지 않습니다.

원본 `연대별_서사_소재_정리.md`는 그대로 두고 1930~2020년대의 열 편과 전체 글을 자동 생성합니다. 마지막 「이 연대기를 움직이는 인과」는 전체 글에 포함됩니다. 추가한 Markdown 자료가 있을 때만 첫 화면에 자료 목록이 나타납니다.

## 로컬에서 실행

Node.js 22 이상이 필요합니다. 저장소 루트에서 실행하세요.

```sh
npm ci
npm run dev
```

터미널에 나온 주소의 `/autobio-bae/`에서 확인합니다. 기본 주소는 `http://127.0.0.1:5173/autobio-bae/`입니다. 서버가 실행 중일 때 원본 Markdown을 추가·수정했다면 개발 서버를 다시 시작하거나 별도 터미널에서 `npm run prepare:content`를 실행합니다.

Firebase를 아직 연결하지 않아도 읽기는 동작합니다. 연결 전에는 댓글 영역과 댓글 링크를 표시하지 않습니다. 추후 Firebase를 연결하면 가족은 각 연대의 본문 아래에서 이름과 내용만 적어 댓글과 답글을 남길 수 있습니다. 전체 읽기에서는 각 연대 마지막의 ‘1930년대 댓글 남기기’ 같은 링크로 해당 연대의 댓글에 바로 이동합니다.

빌드 결과를 확인하려면 다음 명령을 실행합니다.

```sh
npm run build
npm run preview
```

## 원고 추가와 수정

배포 후에는 모바일 브라우저의 GitHub 저장소에서 Markdown 파일을 열어 연필 버튼으로 수정하고 `main`에 커밋하면 됩니다. 새 글은 저장소 루트 또는 `content/` 아래에 `.md` 파일로 추가하세요. GitHub Actions가 목록과 읽기 페이지를 다시 만들고 배포하므로 매번 수동 배포할 필요가 없습니다. PR로 작업한다면 `main`으로 병합된 뒤 반영됩니다.

새 자료 예시:

```md
---
id: moving-to-dokjeong
title: 독정리로 이사하던 날
description: 가족이 함께 기억하는 첫날의 풍경입니다.
category: 가족의 기억
date: 1977-04-01
---

# 독정리로 이사하던 날

이곳에 이야기를 적습니다.

![그날의 사진](./사진/이삿날.jpg)
```

- **`id`를 처음부터 지정하는 것을 권합니다.** 댓글이 연결되는 영구 식별자입니다. 제목과 파일명이 바뀌어도 `id`를 그대로 유지하세요. 영문 소문자·숫자·`-`·`_`로 1~80자까지 지정할 수 있으며 다른 자료와 중복되면 빌드가 중단됩니다.
- `id`를 생략하면 파일 경로를 바탕으로 자동 생성합니다. 이 경우 파일을 이동하거나 이름을 바꾸면 댓글 연결이 달라집니다. 기존 ID는 생성된 `site/.vitepress/generated/catalog.json`에서 확인하여 frontmatter에 지정할 수 있습니다.
- `title`, `description`, `category`, `date`는 선택 항목입니다. 제목을 생략하면 첫 `# 제목` 또는 파일명을 사용합니다.
- `published: false` 또는 `draft: true`를 frontmatter에 넣으면 사이트에서 제외됩니다. **공개 저장소에 커밋한 파일 자체는 GitHub에서 계속 공개됩니다.**
- 루트의 일반 `.md`와 `content/**/*.md`를 수집합니다. `README`, `AGENTS`, `SETUP`, `DEPLOYMENT`, `DEPLOY`, `CONTRIBUTING`, `CHANGELOG`, `LICENSE`, `SECURITY`, `CODE_OF_CONDUCT`, `운영안내`, `설치안내` 문서와 숨김 파일·폴더, 심볼릭 링크는 제외합니다. `site/`, `scripts/`, `tests/` 등의 개발 문서는 수집하지 않습니다.
- 일반 Markdown의 상대 이미지·첨부 링크와 다른 공개 Markdown 문서 링크를 변환합니다. 첨부파일도 원고와 함께 커밋하세요. 찾을 수 없는 링크는 빌드 로그에 경고가 나옵니다. 원고에 임의 HTML이나 스크립트를 넣는 방식은 지원하지 않습니다.

`site/read/`와 `site/.vitepress/generated/`는 생성 결과입니다. 직접 편집하거나 커밋하지 마세요. 연대별 원본의 `## 1930년대 …`부터 `## 2020년대 …`까지 제목 구조는 유지해야 합니다. 본문과 소제목은 자유롭게 수정할 수 있습니다.

## Firebase 댓글 연결 · 추후 설정

현재는 Firebase를 연결하지 않고 읽기 사이트를 운영합니다. 댓글을 사용하기로 할 때 운영자가 [Firebase 콘솔](https://console.firebase.google.com/)에서 아래 절차를 한 번 진행하면 됩니다. 가족에게는 이 절차나 Firebase 계정이 필요하지 않습니다. 내부적으로 댓글을 등록할 때 익명 인증이 자동 처리됩니다. [익명 인증 공식 안내](https://firebase.google.com/docs/auth/web/anonymous-auth)

1. Firebase 프로젝트를 만들고 무료 **Spark** 요금제를 사용합니다. 이 구성에는 결제 계정 연결, Cloud Functions, Firebase Hosting이 필요하지 않습니다.
2. **Authentication → Sign-in method**에서 **Anonymous(익명)**를 활성화합니다.
3. **Firestore Database → Create database**에서 **Standard edition**, 데이터베이스 ID **`(default)`**, **Production mode**로 만듭니다. 가족이 주로 한국에서 접속한다면 제공되는 지역 중 서울(`asia-northeast3`)을 선택할 수 있습니다. 테스트 모드의 전체 쓰기 허용 규칙을 사용하지 않습니다.
4. **프로젝트 설정 → 내 앱 → 웹 앱(`</>`)**을 등록합니다. Firebase Hosting 연결은 선택하지 않아도 됩니다. 표시된 `firebaseConfig`에서 아래 네 값을 복사합니다. [웹 앱 등록 안내](https://firebase.google.com/docs/web/setup#register-app)

| Firebase 웹 설정 | 이 프로젝트의 변수          |
| ---------------- | --------------------------- |
| `apiKey`         | `VITE_FIREBASE_API_KEY`     |
| `authDomain`     | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId`      | `VITE_FIREBASE_PROJECT_ID`  |
| `appId`          | `VITE_FIREBASE_APP_ID`      |

로컬에서는 `.env.example`을 저장소 루트의 `.env`로 복사하고 네 값을 채웁니다. `.env`는 Git에서 제외됩니다. 설정을 바꾼 뒤 개발 서버를 다시 시작하세요. `SITE_BASE` 기본값은 `/autobio-bae/`이고, 루트 주소로 확인하려면 `/`로 바꿀 수 있습니다.

```sh
cp .env.example .env
```

이 네 값은 브라우저에서 사용하는 **공개 앱 설정값**입니다. 서비스 계정 JSON, 비공개 키, Admin SDK 자격증명을 `.env`의 `VITE_` 변수나 GitHub 저장소에 넣지 마세요. 데이터 접근 권한은 아래 Firestore 규칙으로 제어합니다.

프로젝트 루트에서 운영자 계정으로 로그인한 다음, `YOUR_PROJECT_ID`를 실제 Firebase 프로젝트 ID로 바꾸어 규칙과 인덱스를 배포합니다. 이 저장소에 `firebase.json`이 있으므로 `firebase init`을 다시 실행할 필요는 없습니다.

```sh
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

이 명령은 Firebase 접근 규칙을 올립니다. 본문 사이트는 다음 GitHub Pages 절차로 배포합니다. 규칙을 수정했을 때는 같은 명령으로 다시 배포해야 합니다. [Firebase CLI 안내](https://firebase.google.com/docs/cli#partial_deploys)

## GitHub Pages 배포 · 최초 한 번

무료 구성에서는 공개 GitHub 저장소를 사용합니다.

1. Firebase 연결 전에는 환경변수 없이 배포합니다. 댓글을 연결할 때 **저장소 Settings → Secrets and variables → Actions → Variables**에서 위 표의 네 `VITE_FIREBASE_…` 변수를 추가하고 Firebase 웹 앱 설정값을 넣습니다. Repository variables를 사용하며, 관리자 비밀키는 필요하지 않습니다.
2. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
3. 이 프로젝트 파일을 `main` 브랜치에 푸시합니다. **Actions → Pages**에서 빌드와 배포 성공을 확인합니다.
4. 배포된 `https://<GitHub 계정>.github.io/<저장소명>/` 주소를 가족에게 공유합니다.

워크플로가 저장소 이름으로 `SITE_BASE=/<저장소명>/`를 자동 지정합니다. `<계정>.github.io` 저장소 자체나 개인 도메인의 루트에 배포한다면 `.github/workflows/deploy.yml`의 `SITE_BASE`를 `/`로 바꾸세요. [VitePress의 Pages 배포 안내](https://vitepress.dev/guide/deploy#github-pages)

PR에서는 콘텐츠 테스트·타입 검사·빌드만 실행하며 공개 사이트는 변경하지 않습니다. `main` 푸시 시 검증을 통과한 빌드가 자동 배포됩니다. Firebase 설정값을 나중에 추가하거나 변경했다면 **Actions → Pages → Run workflow → main**으로 다시 빌드·배포해야 합니다. Firebase 값 없이 배포된 사이트는 읽기를 제공하며 댓글 영역과 댓글 버튼은 숨깁니다.

## 댓글 운영과 무료 범위

이 사이트의 **본문은 공개**이며, Firebase 연결 후 사용하는 댓글도 공개됩니다. 가족 초대나 신원 확인 기능은 없으며, 이름은 작성자가 적은 표시명입니다. 가족은 이메일, 비밀번호, 인증번호를 입력하지 않습니다. 같은 브라우저에서는 작성한 이름과 글자 크기, 읽던 위치를 기억합니다.

댓글은 `pages/{문서 ID}/comments/{댓글 ID}`에 저장됩니다. 연대별 문서 ID는 `life-1930s`부터 `life-2020s`까지이며, 전체 읽기의 연대별 링크도 같은 댓글 영역으로 연결됩니다. 전체 글에 별도 댓글을 받지 않아 한 연대의 의견이 여러 곳에 나뉘지 않습니다. 추가 자료는 각 문서의 고정 ID로 댓글을 받습니다.

이름은 24자, 내용은 2,000자 이내이고 한 익명 사용자당 등록 간격은 최소 15초입니다. 규칙이 본문 길이, 작성 시각, 답글의 원댓글, 연속 등록 간격을 검사합니다. 새 브라우저로 다시 접속하는 행위까지 막는 가족 전용 인증이나 완전한 스팸 방지 기능은 아닙니다.

목록은 30개씩 불러오며 상시 실시간 구독을 사용하지 않습니다. 새 댓글은 새로고침으로 확인합니다. 작성자가 직접 수정·삭제하는 기능은 제공하지 않으며, 운영자는 Firebase 콘솔의 Firestore 화면에서 댓글을 삭제할 수 있습니다. 원댓글을 지울 때 연결된 답글도 함께 확인하세요. 자동 이메일 알림 기능은 포함하지 않습니다.

GitHub Pages와 Firebase Spark의 무료 사용량 안에서 운영합니다. Firestore 무료 제공량은 기본 데이터베이스 하나에 저장 공간 1GiB, 하루 읽기 5만 회, 쓰기 2만 회 등이며, 댓글 제한 확인 등으로 댓글 하나가 여러 읽기·쓰기를 사용할 수 있습니다. 무료 한도를 넘으면 댓글 요청이 제한될 수 있지만 정적 본문 읽기는 계속됩니다. 사용량은 Firebase 콘솔에서 확인하고 무료 운영을 원하면 Spark를 유지하세요. [Firestore 무료 제공량](https://firebase.google.com/docs/firestore/quotas#free-quota)

## 공유 미리보기와 아이콘

링크를 공유하면 **아버지의 기록**이라는 제목과 **자서전을 준비하며, 연대별 기억과 소재를 모읍니다.**라는 설명을 사용합니다. 각 연대를 공유할 때에는 해당 연대의 제목과 주소를 함께 제공합니다. 공유 정보는 자바스크립트 실행 없이 읽을 수 있도록 HTML에 포함됩니다.

공유 이미지는 `site/public/og-image.png`(1200×630)이고 브라우저·모바일 아이콘과 `site.webmanifest`도 같은 폴더에 있습니다. 디자인이나 문구를 수정할 때는 `scripts/generate-share-assets.mjs`를 수정하고 `npm run assets:share`로 이미지를 다시 생성한 뒤 커밋하세요. 재생성에는 Playwright의 Chromium이 필요합니다.

## 검증

```sh
npm test
npm run build
npm run typecheck
npm run test:sharing
```

원본 보존, 열 개 연대 분리, 새 문서 수집, ID 충돌, 초안 제외, 링크 변환을 검사합니다. 타입 검사는 먼저 `npm run build` 또는 `npm run prepare:content`로 생성 자료를 준비한 뒤 실행합니다.

브라우저를 설치하고 모바일 화면·읽기 동작을 검사할 수 있습니다.

```sh
npx playwright install chromium
npm run test:e2e
```

Firestore 규칙과 실제 댓글 등록 흐름은 로컬 Firebase 에뮬레이터로 검사합니다. Java 21 이상을 준비하세요. 아래 명령은 `demo-family-library` 프로젝트를 사용하며 운영 Firebase 데이터에는 연결하지 않습니다. 첫 실행에는 에뮬레이터 다운로드가 필요합니다.

```sh
npm run test:rules
npm run test:comments
```

배포 워크플로는 Node.js만 사용하며 에뮬레이터 검사를 실행하지 않습니다. 댓글 규칙이나 등록 코드를 변경하면 로컬에서 두 검사를 함께 실행하세요.
