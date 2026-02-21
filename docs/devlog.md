# WaterMelon 🍉 개발 일지

## 프로젝트 개요
- **프로젝트명**: WaterMelon
- **목표**: YouTube 영상에서 곡 정보를 추출하여 Spotify 플레이리스트를 자동 생성하는 Chrome Extension
- **해커톤**: 제 1회 OKKY 바이브코딩 해커톤

---

## Phase 1: 프로젝트 기반 구축

### 문서 작성 및 Git 초기화
- `SPEC.md` 작성 — 7개 기능 요구사항 정의 (곡 추출, 미리보기, OAuth, 매칭, 플레이리스트 생성, 진행 UI, 에러 핸들링)
- `ADR.md` 작성 — 6개 아키텍처 결정 기록 (Manifest V3, 순수 JS, 라이브러리 미사용, 메시징 패턴, Implicit Grant, 브랜드 디자인)
- `AGENTS.md` — 해커톤 공정성 지침 (첫 커밋에 포함)
- Git 저장소 초기화

### 기술 스택 결정
| 항목 | 선택 | 이유 |
|------|------|------|
| 언어 | 순수 JavaScript | 빌드 스텝 불필요, 해커톤 속도 |
| 매니페스트 | V3 | Chrome Web Store 필수 |
| OAuth | Implicit Grant | Extension에서 client_secret 불필요 |
| 프레임워크 | 없음 | CSP 제약, 번들러 불필요 |

---

## Phase 2: 핵심 구조 구현

### Manifest & 아이콘
- `manifest.json` — Manifest V3, permissions (`activeTab`, `identity`, `storage`)
- Content script: `youtube.com/*` URL 매칭
- Background: Service Worker 기반
- 수박 슬라이스 아이콘 생성 (16/48/128px PNG, Python Pillow로 생성)

### Content Script (`content/content.js`)
- YouTube 영상 설명란에서 타임스탬프 패턴 추출
- 정규식: `[00:00:00] Artist - Title`, `0:00 Title` 등 다양한 포맷 지원
- Artist-Title 분리 로직 (`-`, `–`, `—` 구분자)
- 번호 접두사(`01.`), feat 접미사 제거

### Popup UI (`popup/`)
- **HTML**: 6개 상태 기반 UI (not-youtube, scanning, empty, songs, progress, done, error)
- **CSS**: 다크 테마 + 수박 그라디언트 (`#FF6B6B` → `#1DB954`), 카드 레이아웃
- **JS**: 곡 리스트 렌더링, 체크박스 선택, Spotify API 연동, 4단계 진행 표시

### Background Service Worker (`background/background.js`)
- `chrome.identity.launchWebAuthFlow`로 Spotify OAuth
- `chrome.storage.local`에 토큰 저장 (만료 1분 전 여유)
- 메시지 라우팅 (`spotifyAuth`, `getToken`)

---

## Phase 3: 시크릿 관리

### 보안 구조 도입
- `secrets.js` 생성 — Spotify Client ID 보관
- `.gitignore`에 `secrets.js` 추가 → git에 커밋되지 않음
- `popup.js`, `background.js`에서 하드코딩된 Client ID 제거, `secrets.js`에서 로드
- `CLAUDE.md` 작성 — 프로젝트 가이드 및 시크릿 관리 규칙 명시

### Spotify App 등록
- Spotify Developer Dashboard에서 앱 생성
- Redirect URI: `https://<extension-id>.chromiumapp.org/`
- Client ID를 `secrets.js`에 설정

---

## Phase 4: 곡 추출 개선

### 문제: "곡 정보를 찾을 수 없습니다"
**원인**: YouTube DOM 셀렉터가 실제 구조와 불일치

**해결**:
- 설명란 셀렉터 대폭 확장 (8개 후보 + `ytd-structured-description-content-renderer` 폴백)
- 고정된 댓글(`pinned comment`) 크롤링 추가 — `pinned-comment-badge`로 식별
- 디버깅용 `console.log('[WaterMelon]')` 추가

### 문제: 관련 없는 노래도 감지됨
**원인**: YouTube 라디오 믹스(`list=RD...`) 사이드바 플레이리스트에서 영상 제목도 추출

**해결**:
- 우선순위 기반 추출 로직 도입
- 설명란/고정댓글/챕터에서 곡이 잡히면 사이드바 플레이리스트는 스킵
- 라디오 믹스, 자동재생 목록의 노이즈 방지

### 현재 크롤링 소스 (우선순위 순)
1. **영상 설명란** (더보기) — 타임스탬프 패턴 파싱
2. **고정된 댓글** — 타임스탬프 패턴 파싱
3. **챕터 타임라인** — DOM에서 챕터 제목 추출
4. **플레이리스트 페이지** — 상위 소스에 결과 없을 때만 동작

---

## 커밋 히스토리

| # | 커밋 | 설명 |
|---|------|------|
| 1 | `9521f6b` | docs: SPEC.md, ADR.md, AGENTS.md |
| 2 | `e948fce` | feat: manifest.json, 수박 아이콘 |
| 3 | `beea5b6` | feat: content script (곡 추출) |
| 4 | `8c8f2dd` | feat: popup UI (브랜딩 + 상태 관리) |
| 5 | `f853ef5` | feat: background service worker (OAuth) |
| 6 | `177ed31` | feat: secrets 관리, CLAUDE.md |
| 7 | `44c99b2` | fix: DOM 셀렉터 확장, 고정 댓글 지원 |
| 8 | `1ea6f81` | fix: 사이드바 플레이리스트 노이즈 방지 |
