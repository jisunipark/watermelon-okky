// WaterMelon Popup — UI 상태 관리 & Spotify API

(() => {
  'use strict';

  // ── Spotify 설정 ──
  // TODO: Spotify Developer Dashboard에서 발급받은 Client ID로 교체
  const SPOTIFY_CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID';
  const SPOTIFY_REDIRECT_URI = chrome.identity.getRedirectURL();
  const SPOTIFY_SCOPES = 'playlist-modify-public playlist-modify-private';
  const SPOTIFY_API = 'https://api.spotify.com/v1';

  // ── DOM 요소 ──
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const states = {
    notYoutube: $('#state-not-youtube'),
    scanning:   $('#state-scanning'),
    empty:      $('#state-empty'),
    songs:      $('#state-songs'),
    progress:   $('#state-progress'),
    done:       $('#state-done'),
    error:      $('#state-error'),
  };

  // ── 상태 데이터 ──
  let currentSongs = [];
  let videoTitle = '';
  let accessToken = '';

  // ── UI 상태 전환 ──
  function showState(name) {
    Object.values(states).forEach(el => el.classList.add('hidden'));
    if (states[name]) states[name].classList.remove('hidden');
  }

  // ── 초기화 ──
  async function init() {
    const tab = await getCurrentTab();
    if (!tab || !tab.url || !tab.url.includes('youtube.com/')) {
      showState('notYoutube');
      return;
    }

    showState('scanning');
    try {
      const result = await sendMessageToTab(tab.id, { action: 'extractSongs' });
      if (!result || !result.songs || result.songs.length === 0) {
        showState('empty');
        return;
      }
      currentSongs = result.songs;
      videoTitle = result.videoTitle || 'WaterMelon Playlist';
      renderSongList();
      showState('songs');
    } catch (err) {
      console.error('Extraction error:', err);
      showState('empty');
    }
  }

  // ── 탭 관련 ──
  function getCurrentTab() {
    return chrome.tabs.query({ active: true, currentWindow: true })
      .then(tabs => tabs[0]);
  }

  function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ── 곡 리스트 렌더링 ──
  function renderSongList() {
    const listEl = $('#song-list');
    const countEl = $('#song-count');
    listEl.innerHTML = '';

    currentSongs.forEach((song, i) => {
      const li = document.createElement('li');
      li.className = 'song-item';
      li.innerHTML = `
        <input type="checkbox" data-index="${i}" checked>
        <div class="song-info">
          <div class="song-title">${escapeHtml(song.title)}</div>
          ${song.artist ? `<div class="song-artist">${escapeHtml(song.artist)}</div>` : ''}
        </div>
        ${song.timestampStr ? `<span class="song-time">${escapeHtml(song.timestampStr)}</span>` : ''}
      `;
      listEl.appendChild(li);
    });

    updateSongCount();
  }

  function updateSongCount() {
    const checked = $$('#song-list input:checked').length;
    $('#song-count').textContent = `${checked}/${currentSongs.length}곡`;
  }

  function getSelectedSongs() {
    const checkboxes = $$('#song-list input[type="checkbox"]');
    return currentSongs.filter((_, i) => checkboxes[i]?.checked);
  }

  // ── 이벤트 리스너 ──
  function setupEventListeners() {
    // 전체 선택/해제
    $('#select-all').addEventListener('change', (e) => {
      $$('#song-list input[type="checkbox"]').forEach(cb => {
        cb.checked = e.target.checked;
      });
      updateSongCount();
    });

    // 개별 체크박스
    $('#song-list').addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        updateSongCount();
        const allChecked = $$('#song-list input:checked').length === currentSongs.length;
        $('#select-all').checked = allChecked;
      }
    });

    // Slice & Sync 버튼
    $('#btn-sync').addEventListener('click', startSync);

    // 재시도 버튼
    $('#btn-retry').addEventListener('click', init);
  }

  // ── Spotify 인증 ──
  async function getAccessToken() {
    // 저장된 토큰 확인
    const stored = await chrome.storage.local.get(['spotify_token', 'spotify_token_expiry']);
    if (stored.spotify_token && stored.spotify_token_expiry > Date.now()) {
      return stored.spotify_token;
    }

    // 새 토큰 요청
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'spotifyAuth' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response?.token) {
          resolve(response.token);
        } else {
          reject(new Error(response?.error || 'Authentication failed'));
        }
      });
    });
  }

  // ── Spotify API 호출 ──
  async function spotifyFetch(endpoint, options = {}) {
    const res = await fetch(`${SPOTIFY_API}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error?.message || `Spotify API error: ${res.status}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async function searchTrack(song) {
    const query = song.artist
      ? `track:${song.title} artist:${song.artist}`
      : song.title;
    const encoded = encodeURIComponent(query);
    const data = await spotifyFetch(`/search?q=${encoded}&type=track&limit=1`);
    const track = data?.tracks?.items?.[0];
    return track ? track.uri : null;
  }

  async function getCurrentUserId() {
    const data = await spotifyFetch('/me');
    return data.id;
  }

  async function createPlaylist(userId, name) {
    const data = await spotifyFetch(`/users/${userId}/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: `🍉 Created by WaterMelon from YouTube`,
        public: false,
      }),
    });
    return data;
  }

  async function addTracksToPlaylist(playlistId, uris) {
    // Spotify는 한 번에 최대 100곡
    for (let i = 0; i < uris.length; i += 100) {
      const batch = uris.slice(i, i + 100);
      await spotifyFetch(`/playlists/${playlistId}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ uris: batch }),
      });
    }
  }

  // ── 진행 상태 업데이트 ──
  function setProgressStep(stepName, message, percent) {
    // 모든 step 비활성화
    $$('.step').forEach(el => {
      el.classList.remove('active', 'completed');
    });

    const stepOrder = ['matching', 'creating', 'done'];
    const currentIdx = stepOrder.indexOf(stepName);

    stepOrder.forEach((name, i) => {
      const el = $(`.step[data-step="${name}"]`);
      if (i < currentIdx) el.classList.add('completed');
      if (i === currentIdx) el.classList.add('active');
    });

    $('#progress-message').textContent = message;
    $('#progress-bar').style.width = `${percent}%`;
  }

  // ── 동기화 시작 ──
  async function startSync() {
    const selectedSongs = getSelectedSongs();
    if (selectedSongs.length === 0) return;

    showState('progress');

    try {
      // 1) Spotify 인증
      accessToken = await getAccessToken();

      // 2) 곡 매칭
      setProgressStep('matching', '곡을 검색하고 있어요...', 10);
      const matchedUris = [];
      const failedSongs = [];

      for (let i = 0; i < selectedSongs.length; i++) {
        const song = selectedSongs[i];
        const percent = 10 + (i / selectedSongs.length) * 50;
        setProgressStep('matching', `${song.title} 검색 중... (${i + 1}/${selectedSongs.length})`, percent);

        try {
          const uri = await searchTrack(song);
          if (uri) {
            matchedUris.push(uri);
          } else {
            failedSongs.push(song);
          }
        } catch {
          failedSongs.push(song);
        }
      }

      if (matchedUris.length === 0) {
        showError('매칭된 곡이 없습니다. 다른 영상에서 시도해보세요.');
        return;
      }

      // 3) 플레이리스트 생성
      setProgressStep('creating', '플레이리스트를 만들고 있어요...', 70);
      const userId = await getCurrentUserId();
      const playlistName = `🍉 ${videoTitle}`.substring(0, 100);
      const playlist = await createPlaylist(userId, playlistName);

      // 4) 곡 추가
      setProgressStep('creating', '곡을 추가하고 있어요...', 85);
      await addTracksToPlaylist(playlist.id, matchedUris);

      // 5) 완료
      setProgressStep('done', '완료!', 100);
      showDone(playlist, matchedUris.length, failedSongs);

    } catch (err) {
      console.error('Sync error:', err);
      showError(err.message || 'Spotify 연결에 실패했습니다.');
    }
  }

  // ── 완료 화면 ──
  function showDone(playlist, matchedCount, failedSongs) {
    showState('done');
    $('#done-stats').textContent = `${matchedCount}곡이 추가되었습니다!`;
    $('#playlist-link').href = playlist.external_urls?.spotify || '#';

    if (failedSongs.length > 0) {
      const failedEl = $('#failed-songs');
      const listEl = $('#failed-list');
      failedEl.classList.remove('hidden');
      listEl.innerHTML = failedSongs
        .map(s => `<li>${escapeHtml(s.artist ? `${s.artist} - ${s.title}` : s.title)}</li>`)
        .join('');
    }
  }

  // ── 에러 화면 ──
  function showError(message) {
    showState('error');
    $('#error-message').textContent = message;
  }

  // ── 유틸리티 ──
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── 시작 ──
  setupEventListeners();
  init();
})();
