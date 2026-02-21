// WaterMelon Content Script — YouTube 곡 정보 추출

(() => {
  'use strict';

  // 타임스탬프 정규식 패턴들
  const TIMESTAMP_RE =
    /(?:\[?\s*)?(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\s*\]?\s*[-–—.]?\s*)(.+)/;

  // "Artist - Title" 또는 "Title - Artist" 분리
  const ARTIST_TITLE_RE = /^(.+?)\s*[-–—]\s*(.+)$/;

  /**
   * 타임스탬프 문자열을 초 단위로 변환
   */
  function parseTimestamp(h, m, s) {
    return (parseInt(h || '0', 10) * 3600) +
           (parseInt(m, 10) * 60) +
           parseInt(s, 10);
  }

  /**
   * 곡명 텍스트를 artist/title로 분리
   */
  function splitArtistTitle(raw) {
    const cleaned = raw
      .replace(/^\d+\.\s*/, '')       // 번호 제거 (1. ...)
      .replace(/\s*\(?(ft\.?|feat\.?)\s*.+?\)?$/i, '') // feat 제거
      .trim();

    const match = cleaned.match(ARTIST_TITLE_RE);
    if (match) {
      return { artist: match[1].trim(), title: match[2].trim() };
    }
    return { artist: '', title: cleaned };
  }

  /**
   * 영상 설명란에서 타임스탬프 패턴 추출
   */
  function extractFromDescription() {
    const songs = [];

    // 설명란 텍스트 가져오기
    const descEl =
      document.querySelector('#description-inner ytd-text-inline-expander #attributed-snippet-text') ||
      document.querySelector('#description-inner ytd-text-inline-expander') ||
      document.querySelector('#description ytd-text-inline-expander') ||
      document.querySelector('#description .content') ||
      document.querySelector('#description');

    if (!descEl) return songs;

    const text = descEl.innerText || descEl.textContent || '';
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(TIMESTAMP_RE);
      if (!match) continue;

      const [, hours, minutes, seconds, rest] = match;
      const timestamp = parseTimestamp(hours, minutes, seconds);
      const { artist, title } = splitArtistTitle(rest);

      if (title) {
        songs.push({
          title,
          artist,
          timestamp,
          timestampStr: (hours ? `${hours}` : '') + `${minutes}:${seconds}`,
          source: 'description'
        });
      }
    }

    return songs;
  }

  /**
   * 챕터 타임라인 DOM에서 곡 정보 추출
   */
  function extractFromChapters() {
    const songs = [];

    const chapterEls = document.querySelectorAll(
      'ytd-macro-markers-list-item-renderer, ' +
      'ytd-chapter-renderer'
    );

    for (const el of chapterEls) {
      const titleEl = el.querySelector(
        '#details h4, #details .macro-markers, .chapter-title'
      );
      const timeEl = el.querySelector(
        '#details #time, #time, .timestamp'
      );

      if (!titleEl) continue;

      const rawTitle = (titleEl.textContent || '').trim();
      const timeText = timeEl ? (timeEl.textContent || '').trim() : '';

      const { artist, title } = splitArtistTitle(rawTitle);

      if (title) {
        songs.push({
          title,
          artist,
          timestamp: 0,
          timestampStr: timeText,
          source: 'chapter'
        });
      }
    }

    return songs;
  }

  /**
   * 플레이리스트 페이지의 영상 제목에서 곡 정보 추출
   */
  function extractFromPlaylist() {
    const songs = [];

    if (!window.location.pathname.includes('/playlist') &&
        !document.querySelector('ytd-playlist-panel-renderer')) {
      return songs;
    }

    const videoEls = document.querySelectorAll(
      'ytd-playlist-panel-video-renderer #video-title, ' +
      'ytd-playlist-video-renderer #video-title'
    );

    for (const el of videoEls) {
      const rawTitle = (el.textContent || '').trim();
      if (!rawTitle) continue;

      const { artist, title } = splitArtistTitle(rawTitle);

      songs.push({
        title,
        artist,
        timestamp: 0,
        timestampStr: '',
        source: 'playlist'
      });
    }

    return songs;
  }

  /**
   * 영상 제목 가져오기
   */
  function getVideoTitle() {
    const el = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, ' +
      'h1.ytd-video-primary-info-renderer'
    );
    return el ? (el.textContent || '').trim() : document.title;
  }

  /**
   * 중복 제거 (title 기준)
   */
  function dedup(songs) {
    const seen = new Set();
    return songs.filter(s => {
      const key = `${s.title.toLowerCase()}|${s.artist.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 전체 추출 실행
   */
  function extractSongs() {
    const descSongs = extractFromDescription();
    const chapterSongs = extractFromChapters();
    const playlistSongs = extractFromPlaylist();

    // 설명란 > 챕터 > 플레이리스트 우선순위
    let allSongs = [...descSongs, ...chapterSongs, ...playlistSongs];
    allSongs = dedup(allSongs);

    return {
      songs: allSongs,
      videoTitle: getVideoTitle(),
      url: window.location.href
    };
  }

  // 메시지 리스너 — popup에서 요청 시 곡 정보 반환
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'extractSongs') {
      const result = extractSongs();
      sendResponse(result);
    }
    return true; // 비동기 응답 허용
  });
})();
