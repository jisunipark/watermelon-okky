// WaterMelon Background Service Worker — OAuth & Spotify API 프록시

importScripts('../secrets.js');

(() => {
  'use strict';

  const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
  const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const SPOTIFY_API = 'https://api.spotify.com/v1';
  const SPOTIFY_SCOPES = 'playlist-modify-public playlist-modify-private';

  // --- PKCE helpers ---

  function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values, (v) => possible[v % possible.length]).join('');
  }

  async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return crypto.subtle.digest('SHA-256', data);
  }

  function base64urlEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // --- Token management ---

  async function getStoredToken() {
    const stored = await chrome.storage.local.get([
      'spotify_token', 'spotify_refresh_token', 'spotify_token_expiry'
    ]);
    if (stored.spotify_token && stored.spotify_token_expiry > Date.now()) {
      return stored.spotify_token;
    }
    if (stored.spotify_refresh_token) {
      try {
        const { token } = await refreshAccessToken(stored.spotify_refresh_token);
        return token;
      } catch {
        return null;
      }
    }
    return null;
  }

  async function authenticateSpotify() {
    // 기존 stale 토큰 클리어
    await chrome.storage.local.remove(['spotify_token', 'spotify_refresh_token', 'spotify_token_expiry']);

    const redirectUri = chrome.identity.getRedirectURL();

    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64urlEncode(hashed);

    // URLSearchParams는 공백을 +로 인코딩 → Spotify가 scope를 못 읽음
    // 직접 %20으로 인코딩하여 URL 구성
    const params = [
      `client_id=${encodeURIComponent(SPOTIFY_CLIENT_ID)}`,
      `response_type=code`,
      `redirect_uri=${encodeURIComponent(redirectUri)}`,
      `scope=${encodeURIComponent(SPOTIFY_SCOPES)}`,
      `code_challenge_method=S256`,
      `code_challenge=${encodeURIComponent(codeChallenge)}`,
      `show_dialog=true`,
    ].join('&');

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: `${SPOTIFY_AUTH_URL}?${params}`,
      interactive: true,
    });

    const url = new URL(responseUrl);
    const error = url.searchParams.get('error');
    if (error) throw new Error(`Spotify rejected: ${error}`);

    const code = url.searchParams.get('code');
    if (!code) throw new Error('No authorization code in response');

    const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error_description || err.error || 'Token exchange failed');
    }

    const data = await tokenRes.json();
    if (!data.access_token) throw new Error('No access token in token response');

    const expiry = Date.now() + ((data.expires_in || 3600) * 1000) - 60000;
    await chrome.storage.local.set({
      spotify_token: data.access_token,
      spotify_refresh_token: data.refresh_token,
      spotify_token_expiry: expiry,
    });

    return data.access_token;
  }

  async function refreshAccessToken(refreshToken) {
    const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenRes.ok) throw new Error('Token refresh failed');

    const data = await tokenRes.json();
    const expiry = Date.now() + ((data.expires_in || 3600) * 1000) - 60000;
    await chrome.storage.local.set({
      spotify_token: data.access_token,
      spotify_refresh_token: data.refresh_token || refreshToken,
      spotify_token_expiry: expiry,
    });

    return { token: data.access_token };
  }

  // --- Spotify API (모든 호출을 background에서 수행) ---

  async function searchTrack(token, title, artist) {
    // 괄호 안의 부제/번역 제거 (예: "뱅뱅뱅 (BANG BANG BANG)" → "뱅뱅뱅")
    const cleanTitle = title.replace(/\s*[\(\[].+?[\)\]]\s*/g, '').trim() || title;

    // 전략 1: 필드 필터 사용 (아티스트 있을 때만)
    // 전략 2: 일반 검색 (제목 + 아티스트)
    // 전략 3: 괄호 안 내용으로 검색 (영문 제목일 수 있음)
    const queries = [];

    if (artist) {
      queries.push(`track:${cleanTitle} artist:${artist}`);
      queries.push(`${cleanTitle} ${artist}`);
    } else {
      queries.push(cleanTitle);
      // 괄호 안 내용이 있으면 그것도 시도 (영문 제목)
      const paren = title.match(/[\(\[](.+?)[\)\]]/);
      if (paren) queries.push(paren[1].trim());
    }
    queries.push(title); // 원본 제목 전체로도 시도

    for (const q of queries) {
      if (!q) continue;
      const encoded = encodeURIComponent(q);
      const res = await fetch(
        `${SPOTIFY_API}/search?q=${encoded}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        console.error('[WaterMelon] Search failed:', res.status, q);
        continue;
      }
      const data = await res.json();
      const track = data.tracks?.items?.[0];
      if (track) return { uri: track.uri };
    }

    console.warn('[WaterMelon] No match found for:', title, artist);
    return null;
  }

  async function createPlaylist(token, name) {
    const plRes = await fetch(`${SPOTIFY_API}/me/playlists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description: 'Created by WaterMelon', public: false }),
    });
    if (!plRes.ok) {
      const errText = await plRes.text();
      console.error('[WaterMelon] Create playlist failed:', plRes.status, errText);
      if (plRes.status === 401 || plRes.status === 403) {
        // 토큰이 잘못된 scope이거나 만료됨 → 클리어
        await chrome.storage.local.remove(['spotify_token', 'spotify_refresh_token', 'spotify_token_expiry']);
      }
      return null;
    }
    const pl = await plRes.json();
    return {
      id: pl.id,
      url: pl.external_urls?.spotify || `https://open.spotify.com/playlist/${pl.id}`,
    };
  }

  async function addTracks(token, playlistId, uris) {
    const res = await fetch(`${SPOTIFY_API}/playlists/${playlistId}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris }),
    });
    if (!res.ok) {
      console.error('[WaterMelon] Add tracks failed:', res.status, await res.text());
    }
    return res.ok;
  }

  /**
   * 전체 싱크 플로우를 background에서 실행
   * popup은 진행 상황을 메시지로 받음
   */
  async function syncPlaylist(songs, videoTitle) {
    let token = await getStoredToken();
    if (!token) return { error: 'Not authenticated' };

    // Step 1: 트랙 매칭
    const matched = [];
    for (const song of songs) {
      const result = await searchTrack(token, song.title, song.artist);
      matched.push({
        ...song,
        confidence: result ? 'matched' : 'uncertain',
        spotifyUri: result?.uri || null,
      });
    }

    const uris = matched.filter(s => s.spotifyUri).map(s => s.spotifyUri);
    if (uris.length === 0) {
      return { matched, matchedCount: 0, playlistUrl: null, error: null };
    }

    // Step 2: 플레이리스트 생성 + 트랙 추가
    let playlist = await createPlaylist(token, `🍉 ${videoTitle}`);

    // 403/401이면 토큰이 stale → 재인증 후 한 번 재시도
    if (!playlist) {
      token = await getStoredToken();
      if (!token) return { matched, matchedCount: uris.length, playlistUrl: null, error: 'Re-auth needed' };
      playlist = await createPlaylist(token, `🍉 ${videoTitle}`);
    }
    if (!playlist) return { matched, matchedCount: uris.length, playlistUrl: null, error: 'Failed to create playlist' };

    const added = await addTracks(token, playlist.id, uris);
    if (!added) return { matched, matchedCount: uris.length, playlistUrl: playlist.url, error: 'Failed to add tracks' };

    return { matched, matchedCount: uris.length, playlistUrl: playlist.url, error: null };
  }

  // --- 메시지 리스너 ---

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'spotifyAuth') {
      authenticateSpotify()
        .then(token => sendResponse({ token }))
        .catch(err => {
          console.error('[WaterMelon] Auth error:', err);
          sendResponse({ error: err.message });
        });
      return true;
    }

    if (msg.action === 'getToken') {
      getStoredToken()
        .then(token => sendResponse({ token }))
        .catch(() => sendResponse({ token: null }));
      return true;
    }

    if (msg.action === 'syncPlaylist') {
      syncPlaylist(msg.songs, msg.videoTitle)
        .then(result => sendResponse(result))
        .catch(err => {
          console.error('[WaterMelon] Sync error:', err);
          sendResponse({ error: err.message });
        });
      return true;
    }

    if (msg.action === 'clearAuth') {
      chrome.storage.local.remove(['spotify_token', 'spotify_refresh_token', 'spotify_token_expiry'])
        .then(() => sendResponse({ ok: true }));
      return true;
    }

    if (msg.action === 'openTab') {
      chrome.tabs.create({ url: msg.url });
      sendResponse({ ok: true });
      return true;
    }
  });
})();
