# WaterMelon 프로젝트 가이드

## 프로젝트 개요
YouTube 영상에서 곡 정보를 추출하여 Spotify 플레이리스트를 생성하는 Chrome Extension.

## 시크릿 관리
- Spotify Client ID 등 민감한 정보는 `secrets.js`에 보관 (gitignore 대상)
- **절대 git에 커밋하지 말 것**: API 키, Client ID, Client Secret, 토큰
- 코드에서는 `secrets.js`를 import하여 사용

## 기술 스택
- React + TypeScript (Vite 빌드) — popup UI
- Tailwind CSS v4 + Framer Motion — 스타일/애니메이션
- 순수 JavaScript — content script, background service worker
- Chrome Extension Manifest V3
- Spotify Web API (Implicit Grant Flow)

## 파일 구조
- `src/` — React 소스 (App.tsx, components/)
- `popup/` — Vite 빌드 산출물 (gitignore 대상)
- `content/content.js` — YouTube 페이지 곡 추출
- `background/background.js` — Spotify OAuth, 메시지 라우팅
- `secrets.js` — API 키 (gitignore 대상, 커밋 금지)

## 빌드
- `npm install` — 의존성 설치
- `npm run build` — popup/ 폴더에 빌드 산출물 생성
- `npm run dev` — 개발 서버 (HMR)

## 커밋 규칙
- 변경점마다 커밋 수행
- 기능 요구사항 변경 시 `SPEC.md` 업데이트
- 아키텍처 결정 시 `ADR.md` 업데이트
