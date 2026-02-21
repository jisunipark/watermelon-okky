// WaterMelon Background Service Worker — OAuth & 메시지 라우팅

importScripts('../secrets.js');

(() => {
  'use strict';

  // SPOTIFY_CLIENT_ID는 secrets.js에서 전역으로 로드됨
  const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
  const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
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

  /**
   * Spotify Authorization Code Flow with PKCE
   */
  async function authenticateSpotify() {
    const redirectUri = chrome.identity.getRedirectURL();

    // 1. PKCE: code_verifier → code_challenge
    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64urlEncode(hashed);

    // 2. Authorization URL
    const authUrl = new URL(SPOTIFY_AUTH_URL);
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', SPOTIFY_SCOPES);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('show_dialog', 'false');

    try {
      // 3. 사용자 인증
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });

      const url = new URL(responseUrl);

      // 에러 체크
      const error = url.searchParams.get('error');
      if (error) {
        throw new Error(`Spotify rejected: ${error}`);
      }

      const code = url.searchParams.get('code');
      if (!code) {
        throw new Error('No authorization code in response');
      }

      // 4. code → access_token 교환
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
      const token = data.access_token;
      const refreshToken = data.refresh_token;
      const expiresIn = data.expires_in || 3600;

      if (!token) {
        throw new Error('No access token in token response');
      }

      // 5. 토큰 저장
      const expiry = Date.now() + (expiresIn * 1000) - 60000; // 1분 여유
      await chrome.storage.local.set({
        spotify_token: token,
        spotify_refresh_token: refreshToken,
        spotify_token_expiry: expiry,
      });

      return { token, expiry };
    } catch (err) {
      console.error('Spotify auth error:', err);
      throw err;
    }
  }

  /**
   * Refresh token으로 access token 갱신
   */
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

    if (!tokenRes.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await tokenRes.json();
    const token = data.access_token;
    const newRefreshToken = data.refresh_token || refreshToken;
    const expiresIn = data.expires_in || 3600;
    const expiry = Date.now() + (expiresIn * 1000) - 60000;

    await chrome.storage.local.set({
      spotify_token: token,
      spotify_refresh_token: newRefreshToken,
      spotify_token_expiry: expiry,
    });

    return { token, expiry };
  }

  // 메시지 리스너
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'spotifyAuth') {
      authenticateSpotify()
        .then(({ token }) => sendResponse({ token }))
        .catch(err => sendResponse({ error: err.message }));
      return true; // 비동기 응답
    }

    if (msg.action === 'getToken') {
      chrome.storage.local.get(['spotify_token', 'spotify_refresh_token', 'spotify_token_expiry'])
        .then(async (stored) => {
          if (stored.spotify_token && stored.spotify_token_expiry > Date.now()) {
            sendResponse({ token: stored.spotify_token });
          } else if (stored.spotify_refresh_token) {
            try {
              const { token } = await refreshAccessToken(stored.spotify_refresh_token);
              sendResponse({ token });
            } catch {
              sendResponse({ token: null });
            }
          } else {
            sendResponse({ token: null });
          }
        });
      return true;
    }
  });
})();
