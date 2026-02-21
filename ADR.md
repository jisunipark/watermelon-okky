# WaterMelon - 아키텍처 결정 기록 (ADR)

## ADR-001: Manifest V3 선택

**상태**: 채택

**맥락**: Chrome Web Store는 2024년부터 Manifest V3만 허용.

**결정**: Manifest V3 사용. Background page 대신 Service Worker 기반.

**결과**: Service Worker 생명주기 관리 필요, `chrome.storage`로 상태 유지.

## ADR-002: React + Vite 빌드 파이프라인

**상태**: 채택 (수정: 순수 JS → React + Vite)

**맥락**: 디자인 레퍼런스(watermelon-ui)를 그대로 옮기려면 React + Tailwind + Framer Motion이 필요. Vite가 가장 가볍고 빠른 빌드 도구.

**결정**: popup을 React + TypeScript로 마이그레이션. Vite로 빌드하여 `popup/` 폴더에 산출물 생성. content/background 스크립트는 빌드 대상 아님(순수 JS 유지).

**트레이드오프**: 빌드 스텝 추가, 하지만 컴포넌트 재사용성과 애니메이션 품질 대폭 향상.

## ADR-003: 외부 라이브러리 사용 (framer-motion, lucide-react)

**상태**: 채택 (수정: 무라이브러리 → 번들 라이브러리)

**맥락**: Vite 빌드를 도입했으므로 CSP 제약 해소. 번들된 JS는 Extension 내부 파일이라 CSP에 걸리지 않음.

**결정**: framer-motion(화면 전환 애니메이션), lucide-react(아이콘), tailwindcss(유틸리티 CSS) 사용.

**결과**: 풍부한 UI 애니메이션, 일관된 디자인 시스템. 번들 크기 ~90KB gzip.

## ADR-004: Content Script ↔ Popup 메시징

**상태**: 채택

**맥락**: Content Script(YouTube 페이지)와 Popup은 별도 컨텍스트.

**결정**: `chrome.tabs.sendMessage` / `chrome.runtime.onMessage` 패턴.
Background Service Worker는 OAuth만 담당.

**결과**: 명확한 역할 분리. Content → 추출, Popup → UI/API, Background → 인증.

## ADR-005: Spotify Implicit Grant Flow

**상태**: 채택

**맥락**: Chrome Extension에서는 client_secret을 안전하게 보관할 수 없음.

**결정**: PKCE 대신 Implicit Grant 사용. Access token을 URL fragment로 수신.

**트레이드오프**: Refresh token 없음, 토큰 만료(1시간) 시 재인증 필요.

## ADR-006: 브랜드 디자인 시스템

**상태**: 채택

**맥락**: "WaterMelon" 브랜드 아이덴티티 구축.

**결정**:
- 수박 그라디언트: `#FF6B6B` (빨강) → `#1DB954` (Spotify 초록)
- 둥근 카드 UI (border-radius: 16px)
- CSS 변수 기반 테마
- 수박 이모지 활용 (🍉)

**결과**: 일관된 시각적 아이덴티티, 재미있는 UX.

## ADR-007: Vite 빌드 파이프라인 도입

**상태**: 채택

**맥락**: React + Tailwind + Framer Motion을 Chrome Extension popup에서 사용하려면 번들러가 필요.

**결정**: Vite를 빌드 도구로 채택. `npm run build` → `popup/` 폴더에 산출물 생성. `popup/`은 gitignore 대상이며 빌드 시 자동 생성.

**구성**:
- `src/` — React 소스 (TypeScript)
- `popup/` — 빌드 산출물 (gitignore)
- content/background — 빌드 대상 아님, 순수 JS 유지

**결과**: 개발 시 `npm run dev`로 HMR, 배포 시 `npm run build`로 최적화된 번들 생성.
