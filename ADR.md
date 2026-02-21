# WaterMelon - 아키텍처 결정 기록 (ADR)

## ADR-001: Manifest V3 선택

**상태**: 채택

**맥락**: Chrome Web Store는 2024년부터 Manifest V3만 허용.

**결정**: Manifest V3 사용. Background page 대신 Service Worker 기반.

**결과**: Service Worker 생명주기 관리 필요, `chrome.storage`로 상태 유지.

## ADR-002: 순수 JavaScript (빌드 스텝 없음)

**상태**: 채택

**맥락**: OKKY 해커톤 타임라인에서 빌드 파이프라인 구축은 오버헤드.

**결정**: TypeScript, 번들러 없이 순수 JS로 개발.

**트레이드오프**: 타입 안전성 없음, 하지만 개발 속도 극대화.

## ADR-003: 외부 라이브러리 미사용

**상태**: 채택

**맥락**: Manifest V3의 CSP 제약으로 외부 스크립트 로딩이 제한됨.

**결정**: DOM 직접 조작, fetch API 직접 사용. 프레임워크 없음.

**결과**: 번들러 불필요, 파일 크기 최소화.

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
