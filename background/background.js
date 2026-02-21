// WaterMelon Background Service Worker — OAuth & 메시지 라우팅

importScripts('../secrets.js');

(() => {
  'use strict';

  // SPOTIFY_CLIENT_ID는 secrets.js에서 전역으로 로드됨
  const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
  const SPOTIFY_SCOPES = 'playlist-modify-public playlist-modify-private';

  /**
   * Spotify Implicit Grant Flow
   * chrome.identity.launchWebAuthFlow로 OAuth 수행
   */
  async function authenticateSpotify() {
    const redirectUri = chrome.identity.getRedirectURL();

    const authUrl = new URL(SPOTIFY_AUTH_URL);
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', SPOTIFY_SCOPES);
    authUrl.searchParams.set('show_dialog', 'false');

    try {
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });

      // URL fragment에서 access_token 추출
      const url = new URL(responseUrl);
      const hash = url.hash.substring(1);
      const params = new URLSearchParams(hash);

      // Spotify 에러 응답 체크 (hash 또는 query param)
      const error = params.get('error') || url.searchParams.get('error');
      if (error) {
        throw new Error(`Spotify rejected: ${error}`);
      }

      const token = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

      if (!token) {
        console.error('Response URL:', responseUrl);
        throw new Error('No access token in response');
      }

      // 토큰 저장
      const expiry = Date.now() + (expiresIn * 1000) - 60000; // 1분 여유
      await chrome.storage.local.set({
        spotify_token: token,
        spotify_token_expiry: expiry,
      });

      return { token, expiry };
    } catch (err) {
      console.error('Spotify auth error:', err);
      throw err;
    }
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
      chrome.storage.local.get(['spotify_token', 'spotify_token_expiry'])
        .then(stored => {
          if (stored.spotify_token && stored.spotify_token_expiry > Date.now()) {
            sendResponse({ token: stored.spotify_token });
          } else {
            sendResponse({ token: null });
          }
        });
      return true;
    }
  });
})();
