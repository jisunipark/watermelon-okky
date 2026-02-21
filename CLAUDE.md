# WaterMelon 프로젝트 가이드

## 프로젝트 개요
YouTube 영상에서 곡 정보를 추출하여 Spotify 플레이리스트를 생성하는 Chrome Extension.

## 시크릿 관리
- Spotify Client ID 등 민감한 정보는 `secrets.js`에 보관 (gitignore 대상)
- **절대 git에 커밋하지 말 것**: API 키, Client ID, Client Secret, 토큰
- 코드에서는 `secrets.js`를 import하여 사용

## 기술 스택
- 순수 JavaScript (빌드 스텝 없음)
- Chrome Extension Manifest V3
- Spotify Web API (Implicit Grant Flow)

## 파일 구조
- `content/content.js` — YouTube 페이지 곡 추출
- `popup/` — 팝업 UI (HTML/CSS/JS)
- `background/background.js` — Spotify OAuth, 메시지 라우팅
- `secrets.js` — API 키 (gitignore 대상, 커밋 금지)

## 커밋 규칙
- 변경점마다 커밋 수행
- 기능 요구사항 변경 시 `SPEC.md` 업데이트
- 아키텍처 결정 시 `ADR.md` 업데이트
