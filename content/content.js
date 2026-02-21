// WaterMelon Content Script — YouTube 곡 정보 추출

(() => {
  'use strict';

  // 타임스탬프 정규식: 00:00, 0:00, 1:23:45 + 뒤따르는 텍스트
  const TIMESTAMP_RE =
    /(?:\[?\s*)?(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\s*\]?\s*[-–—.)]*\s*)(.+)/;

  // "Artist - Title" 분리
  const ARTIST_TITLE_RE = /^(.+?)\s*[-–—]\s*(.+)$/;

  function parseTimestamp(h, m, s) {
    return (parseInt(h || '0', 10) * 3600) +
           (parseInt(m, 10) * 60) +
           parseInt(s, 10);
  }

  function splitArtistTitle(raw) {
    const cleaned = raw
      .replace(/^\d+\.\s*/, '')
      .replace(/\s*\(?(ft\.?|feat\.?)\s*.+?\)?$/i, '')
      .trim();

    const match = cleaned.match(ARTIST_TITLE_RE);
    if (match) {
      return { artist: match[1].trim(), title: match[2].trim() };
    }
    return { artist: '', title: cleaned };
  }

  /**
   * 텍스트 블록에서 타임스탬프 패턴 라인을 파싱
   */
  function parseLinesForSongs(text, source) {
    const songs = [];
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
          source
        });
      }
    }

    return songs;
  }

  /**
   * 1) 영상 설명란 (더보기)
   * YouTube는 설명란 텍스트를 여러 셀렉터에 나눠 렌더링함
   */
  function extractFromDescription() {
    // 여러 가능한 셀렉터 시도
    const selectors = [
      'ytd-watch-metadata #description-inner',
      'ytd-watch-metadata #description',
      '#meta #description',
      'ytd-text-inline-expander #attributed-snippet-text',
      'ytd-text-inline-expander .content',
      'ytd-text-inline-expander',
      '#description.ytd-watch-metadata',
      '#description',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;

      const text = el.innerText || el.textContent || '';
      if (text.trim().length < 5) continue;

      const songs = parseLinesForSongs(text, 'description');
      if (songs.length > 0) return songs;
    }

    // 최후 수단: structured-description 내 모든 텍스트
    const structured = document.querySelector('ytd-structured-description-content-renderer');
    if (structured) {
      const text = structured.innerText || structured.textContent || '';
      const songs = parseLinesForSongs(text, 'description');
      if (songs.length > 0) return songs;
    }

    return [];
  }

  /**
   * 2) 고정된 댓글
   */
  function extractFromPinnedComment() {
    // 고정 댓글은 "pinned-comment-badge" 또는 "pinned by" 라벨이 있음
    const commentThreads = document.querySelectorAll('ytd-comment-thread-renderer');

    for (const thread of commentThreads) {
      const pinnedBadge = thread.querySelector(
        '#pinned-comment-badge, ' +
        '#author-comment-badge, ' +
        '.ytd-pinned-comment-badge-renderer'
      );
      if (!pinnedBadge) continue;

      const contentEl = thread.querySelector(
        '#content-text, ' +
        'yt-attributed-string#content-text, ' +
        'yt-formatted-string#content-text'
      );
      if (!contentEl) continue;

      const text = contentEl.innerText || contentEl.textContent || '';
      const songs = parseLinesForSongs(text, 'pinned_comment');
      if (songs.length > 0) return songs;
    }

    return [];
  }

  /**
   * 3) 챕터 타임라인 (영상 내 챕터 마커)
   */
  function extractFromChapters() {
    const songs = [];

    // 챕터 패널의 각 항목
    const chapterEls = document.querySelectorAll(
      'ytd-macro-markers-list-item-renderer'
    );

    for (const el of chapterEls) {
      const titleEl = el.querySelector(
        'h4, #details h4, .macro-markers-list-item-title'
      );
      const timeEl = el.querySelector(
        '#time, .timestamp, #details #time'
      );

      if (!titleEl) continue;

      const rawTitle = (titleEl.textContent || '').trim();
      if (!rawTitle) continue;

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

    // 프로그레스바 위 챕터 (hover 시 보이는 것들)도 시도
    if (songs.length === 0) {
      const chapterTitles = document.querySelectorAll(
        '.ytp-chapter-title-content'
      );
      // 현재 재생 중인 챕터 하나만 보이므로 리스트로는 부적합
    }

    return songs;
  }

  /**
   * 4) 플레이리스트 영상 제목
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

  function getVideoTitle() {
    const el = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, ' +
      'h1.ytd-video-primary-info-renderer, ' +
      '#title h1 yt-formatted-string'
    );
    return el ? (el.textContent || '').trim() : document.title;
  }

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
   * 전체 추출 — 설명란 > 고정 댓글 > 챕터 > 플레이리스트 순
   */
  function extractSongs() {
    const descSongs = extractFromDescription();
    const pinnedSongs = extractFromPinnedComment();
    const chapterSongs = extractFromChapters();
    const playlistSongs = extractFromPlaylist();

    let allSongs = [...descSongs, ...pinnedSongs, ...chapterSongs, ...playlistSongs];
    allSongs = dedup(allSongs);

    console.log('[WaterMelon] Extraction results:', {
      description: descSongs.length,
      pinnedComment: pinnedSongs.length,
      chapters: chapterSongs.length,
      playlist: playlistSongs.length,
      total: allSongs.length,
    });

    return {
      songs: allSongs,
      videoTitle: getVideoTitle(),
      url: window.location.href
    };
  }

  // 메시지 리스너
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'extractSongs') {
      const result = extractSongs();
      sendResponse(result);
    }
    return true;
  });
})();
