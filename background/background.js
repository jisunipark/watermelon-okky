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
    const redirectUri = chrome.identity.getRedirectURL();

    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64urlEncode(hashed);

    const authUrl = new URL(SPOTIFY_AUTH_URL);
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', SPOTIFY_SCOPES);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('show_dialog', 'false');

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
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
    const query = encodeURIComponent(`track:${title} artist:${artist}`);
    const res = await fetch(
      `${SPOTIFY_API}/search?q=${query}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      console.error('[WaterMelon] Search failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const track = data.tracks?.items?.[0];
    return track ? { uri: track.uri } : null;
  }

  async function createPlaylist(token, name) {
    const meRes = await fetch(`${SPOTIFY_API}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      console.error('[WaterMelon] /me failed:', meRes.status, await meRes.text());
      return null;
    }
    const me = await meRes.json();

    const plRes = await fetch(`${SPOTIFY_API}/users/${me.id}/playlists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description: 'Created by WaterMelon', public: false }),
    });
    if (!plRes.ok) {
      console.error('[WaterMelon] Create playlist failed:', plRes.status, await plRes.text());
      return null;
    }
    const pl = await plRes.json();
    return {
      id: pl.id,
      url: pl.external_urls?.spotify || `https://open.spotify.com/playlist/${pl.id}`,
    };
  }

  async function addTracks(token, playlistId, uris) {
    const res = await fetch(`${SPOTIFY_API}/playlists/${playlistId}/tracks`, {
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
  async function syncPlaylist(songs, videoTitle, senderTabId) {
    const token = await getStoredToken();
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
    const playlist = await createPlaylist(token, `🍉 ${videoTitle}`);
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

    if (msg.action === 'openTab') {
      chrome.tabs.create({ url: msg.url });
      sendResponse({ ok: true });
      return true;
    }
  });
})();
