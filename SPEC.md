# WaterMelon - 기능 요구사항 명세서

YouTube 영상에서 곡 정보를 추출하여 Spotify 플레이리스트를 자동 생성하는 Chrome Extension.

## S1. 곡 정보 추출

YouTube 영상 페이지에서 다음 소스로부터 곡 정보를 파싱한다.

### 타임스탬프 패턴 (영상 설명란)
정규식으로 다음 패턴을 지원:
- `00:00 Artist - Title`
- `00:00 Title - Artist`
- `1:23:45 Artist - Title`
- `00:00 Title (by Artist)`
- `[00:00] Artist - Title`

### 챕터 타임라인 DOM
- YouTube 챕터 UI에서 제목 텍스트 추출

### 플레이리스트 영상 제목
- YouTube 플레이리스트 페이지의 각 영상 제목에서 곡명/아티스트 파싱

## S2. 곡 리스트 미리보기

- 추출된 곡을 popup에서 체크박스 리스트로 표시
- 각 곡: 제목, 아티스트, 타임스탬프 표시
- 전체 선택/해제 토글

## S3. Spotify OAuth 인증

- `chrome.identity.launchWebAuthFlow` 사용
- Scope: `playlist-modify-public playlist-modify-private`
- Implicit Grant Flow (client_secret 불필요)
- Token 만료 시 재인증 유도

## S4. Spotify 곡 매칭

- Spotify Search API (`GET /v1/search`)로 각 곡 검색
- 매칭 성공/실패 시각적 표시
- 실패 곡은 리스트에서 별도 표시

## S5. 플레이리스트 생성

- 새 플레이리스트 이름: 영상 제목 기반 자동 생성
- 매칭된 곡 일괄 추가 (`POST /v1/playlists/{id}/tracks`)

## S6. 진행 상태 UI

4단계 진행 표시:
1. **Scanning** — 곡 정보 추출 중
2. **Matching** — Spotify 곡 매칭 중
3. **Creating** — 플레이리스트 생성 중
4. **Done** — 완료, 플레이리스트 링크 제공

## S7. 에러 핸들링

- YouTube 페이지가 아닐 때: "YouTube 영상 페이지에서 사용해주세요" 안내
- 곡 미검출 시: "곡 정보를 찾을 수 없습니다" 안내
- Spotify 연결 실패: 재시도 버튼 제공
