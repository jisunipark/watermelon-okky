import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { SongCard } from "./components/SongCard"
import { ProgressStep } from "./components/ProgressStep"
import { PillButton } from "./components/PillButton"

type Screen = "idle" | "login" | "song-list" | "syncing" | "success"

interface Song {
  title: string
  artist: string
  confidence: "matched" | "uncertain"
  spotifyUri?: string
}

const PROGRESS_STEPS = [
  { emoji: "🔍", label: "Scanning YouTube..." },
  { emoji: "🎵", label: "Matching tracks..." },
  { emoji: "📋", label: "Creating playlist..." },
  { emoji: "🍉", label: "Done!" },
]

const SpotifyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
)

const transition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3 },
}

// --- Background message helpers ---

function sendBg(msg: Record<string, unknown>): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        console.error("[WaterMelon] sendBg error:", chrome.runtime.lastError.message)
        resolve(null)
      } else {
        resolve(res)
      }
    })
  })
}

async function extractSongsFromTab(
  tabId: number
): Promise<{ songs: { title: string; artist: string }[]; videoTitle: string } | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "extractSongs" }, (res) => {
      if (chrome.runtime.lastError) {
        resolve(null)
      } else {
        resolve(res)
      }
    })
  })
}

async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/content.js"],
  })
}

// --- Screens ---

function IdleScreen() {
  return (
    <motion.div
      {...transition}
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6"
    >
      <motion.span
        className="text-7xl"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        🍉
      </motion.span>
      <h1 className="text-2xl font-bold tracking-tight text-white">WaterMelon</h1>
      <p className="text-center text-sm text-wm-muted">
        Open a YouTube video to get started
      </p>
    </motion.div>
  )
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <motion.div
      {...transition}
      className="flex flex-1 flex-col items-center justify-center gap-6 px-6"
    >
      <motion.span
        className="text-6xl"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        🍉
      </motion.span>

      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Connect your Spotify</h2>
        <p className="mt-1.5 text-sm text-wm-muted">
          We need permission to create playlists
        </p>
      </div>

      <PillButton onClick={onLogin} variant="green" fullWidth icon={<SpotifyIcon />}>
        Login with Spotify
      </PillButton>
    </motion.div>
  )
}

function SongListScreen({
  songs,
  onSync,
}: {
  songs: Song[]
  onSync: () => void
}) {
  const matchedCount = songs.filter((s) => s.confidence === "matched").length
  return (
    <motion.div {...transition} className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🍉</span>
          <span className="text-base font-bold text-white">WaterMelon</span>
        </div>
        <span className="rounded-full bg-wm-green/10 px-3 py-1 text-xs font-semibold text-wm-green">
          {songs.length} tracks found
        </span>
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        <div className="flex flex-col gap-2">
          {songs.map((song, i) => (
            <SongCard
              key={`${song.title}-${song.artist}`}
              index={i}
              title={song.title}
              artist={song.artist}
              confidence={song.confidence}
            />
          ))}
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="border-t border-wm-border bg-wm-dark/80 px-5 py-4 backdrop-blur-sm">
        <div className="mb-2 text-center text-xs text-wm-muted">
          {matchedCount} matched &middot; {songs.length - matchedCount} uncertain
        </div>
        <PillButton onClick={onSync} variant="green" fullWidth>
          {"Slice & Sync 🍉"}
        </PillButton>
      </div>
    </motion.div>
  )
}

function SyncingScreen({
  activeStep,
}: {
  activeStep: number
}) {
  return (
    <motion.div
      {...transition}
      className="flex flex-1 flex-col items-center justify-center gap-6 px-6"
    >
      <div className="w-full flex flex-col gap-3">
        <div className="mb-2 text-center">
          <span className="text-lg">🍉</span>
          <p className="mt-1 text-sm font-semibold text-white">Syncing your tracks...</p>
        </div>

        {PROGRESS_STEPS.map((step, i) => (
          <ProgressStep
            key={step.label}
            emoji={step.emoji}
            label={step.label}
            index={i}
            status={i < activeStep ? "done" : i === activeStep ? "active" : "pending"}
          />
        ))}
      </div>
    </motion.div>
  )
}

function SuccessScreen({
  trackCount,
  playlistUrl,
  onAnother,
}: {
  trackCount: number
  playlistUrl: string | null
  onAnother: () => void
}) {
  return (
    <motion.div
      {...transition}
      className="flex flex-1 flex-col items-center justify-center gap-5 px-6"
    >
      <motion.span
        className="text-7xl"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 15 }}
      >
        🍉
      </motion.span>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <h2 className="text-xl font-bold text-white">Playlist created!</h2>
        <p className="mt-1 text-sm text-wm-muted">{trackCount} tracks added to Spotify</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex w-full flex-col items-center gap-3"
      >
        <PillButton
          variant="green"
          fullWidth
          icon={<SpotifyIcon />}
          onClick={() => {
            if (playlistUrl) sendBg({ action: "openTab", url: playlistUrl })
          }}
        >
          Open in Spotify
        </PillButton>
        <button
          onClick={onAnother}
          className="text-sm text-wm-muted transition-colors hover:text-white"
        >
          Sync another video
        </button>
      </motion.div>
    </motion.div>
  )
}

// --- Main App ---

export function App() {
  const [screen, setScreen] = useState<Screen>("idle")
  const [songs, setSongs] = useState<Song[]>([])
  const [videoTitle, setVideoTitle] = useState("")
  const [activeStep, setActiveStep] = useState(0)
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null)
  const [matchedCount, setMatchedCount] = useState(0)

  // On mount: check for existing token, then try to extract songs
  useEffect(() => {
    async function init() {
      const tokenRes = await sendBg({ action: "getToken" })
      const existingToken = tokenRes?.token ?? null

      // Ask content script for songs
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url?.includes("youtube.com/watch")) return

      let res = await extractSongsFromTab(tab.id)
      if (!res) {
        await injectContentScript(tab.id)
        res = await extractSongsFromTab(tab.id)
      }
      if (!res?.songs?.length) return

      const extracted: Song[] = res.songs.map((s) => ({
        title: s.title,
        artist: s.artist,
        confidence: "matched" as const,
      }))
      setSongs(extracted)
      setVideoTitle(res.videoTitle || "YouTube Playlist")

      if (existingToken) {
        setScreen("song-list")
      } else {
        setScreen("login")
      }
    }
    init().catch((err) => console.error("[WaterMelon] Init error:", err))
  }, [])

  const handleLogin = useCallback(async () => {
    const res = await sendBg({ action: "spotifyAuth" })
    if (res?.error) return
    if (res?.token && songs.length > 0) {
      setScreen("song-list")
    }
  }, [songs.length])

  const handleSync = useCallback(async () => {
    setScreen("syncing")
    setActiveStep(0)

    // Step 0: Scanning (already done)
    await new Promise((r) => setTimeout(r, 600))
    setActiveStep(1)

    // Background에서 전체 싱크 수행
    const result = await sendBg({
      action: "syncPlaylist",
      songs: songs.map((s) => ({ title: s.title, artist: s.artist })),
      videoTitle,
    })

    if (!result || result.error === 'Not authenticated') {
      setScreen("login")
      return
    }

    // 결과 반영
    if (result.matched) {
      setSongs(result.matched.map((s: any) => ({
        title: s.title,
        artist: s.artist,
        confidence: s.confidence,
        spotifyUri: s.spotifyUri,
      })))
    }
    setActiveStep(2)

    setMatchedCount(result.matchedCount || 0)
    setPlaylistUrl(result.playlistUrl || null)

    setActiveStep(3)
    await new Promise((r) => setTimeout(r, 800))
    setScreen("success")
  }, [songs, videoTitle])

  return (
    <div className="relative flex h-[580px] w-[380px] flex-col overflow-hidden rounded-2xl border border-wm-border bg-wm-dark shadow-2xl shadow-black/60">
      {/* Subtle gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-wm-red/[0.04] via-transparent to-wm-green/[0.04]" />

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {screen === "idle" && <IdleScreen key="idle" />}
          {screen === "login" && (
            <LoginScreen key="login" onLogin={handleLogin} />
          )}
          {screen === "song-list" && (
            <SongListScreen key="songs" songs={songs} onSync={handleSync} />
          )}
          {screen === "syncing" && (
            <SyncingScreen key="syncing" activeStep={activeStep} />
          )}
          {screen === "success" && (
            <SuccessScreen
              key="success"
              trackCount={matchedCount}
              playlistUrl={playlistUrl}
              onAnother={() => setScreen("idle")}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
