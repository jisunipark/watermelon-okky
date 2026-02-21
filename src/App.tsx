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

// --- Spotify API helpers ---

async function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getToken" }, (res) => {
      resolve(res?.token ?? null)
    })
  })
}

async function spotifyAuth(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "spotifyAuth" }, (res) => {
      if (res?.error) {
        console.error("Spotify auth error:", res.error)
        resolve(null)
      } else {
        resolve(res?.token ?? null)
      }
    })
  })
}

async function searchSpotifyTrack(
  token: string,
  title: string,
  artist: string
): Promise<{ uri: string } | null> {
  const query = encodeURIComponent(`track:${title} artist:${artist}`)
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return null
  const data = await res.json()
  const track = data.tracks?.items?.[0]
  return track ? { uri: track.uri } : null
}

async function createPlaylist(
  token: string,
  name: string
): Promise<{ id: string; url: string } | null> {
  // Get user ID
  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!meRes.ok) return null
  const me = await meRes.json()

  const plRes = await fetch(
    `https://api.spotify.com/v1/users/${me.id}/playlists`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description: "Created by WaterMelon 🍉",
        public: false,
      }),
    }
  )
  if (!plRes.ok) return null
  const pl = await plRes.json()
  return { id: pl.id, url: pl.external_urls?.spotify }
}

async function addTracksToPlaylist(
  token: string,
  playlistId: string,
  uris: string[]
): Promise<boolean> {
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris }),
    }
  )
  return res.ok
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
            if (playlistUrl) chrome.tabs.create({ url: playlistUrl })
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
  const [token, setToken] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null)
  const [matchedCount, setMatchedCount] = useState(0)

  // On mount: check for existing token, then try to extract songs
  useEffect(() => {
    async function init() {
      const existingToken = await getToken()
      if (existingToken) setToken(existingToken)

      // Ask content script for songs
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url?.includes("youtube.com/watch")) return

      chrome.tabs.sendMessage(tab.id, { action: "extractSongs" }, (res) => {
        if (chrome.runtime.lastError || !res?.songs?.length) return
        const extracted: Song[] = res.songs.map((s: { title: string; artist: string }) => ({
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
      })
    }
    init()
  }, [])

  const handleLogin = useCallback(async () => {
    const t = await spotifyAuth()
    if (t) {
      setToken(t)
      if (songs.length > 0) {
        setScreen("song-list")
      }
    }
  }, [songs.length])

  const handleSync = useCallback(async () => {
    if (!token) return
    setScreen("syncing")
    setActiveStep(0)

    // Step 0: Scanning (already done)
    await new Promise((r) => setTimeout(r, 600))
    setActiveStep(1)

    // Step 1: Match tracks on Spotify
    const matched: Song[] = []
    for (const song of songs) {
      const result = await searchSpotifyTrack(token, song.title, song.artist)
      matched.push({
        ...song,
        confidence: result ? "matched" : "uncertain",
        spotifyUri: result?.uri,
      })
    }
    setSongs(matched)
    setActiveStep(2)

    // Step 2: Create playlist & add tracks
    const uris = matched.filter((s) => s.spotifyUri).map((s) => s.spotifyUri!)
    setMatchedCount(uris.length)

    if (uris.length > 0) {
      const playlistName = `🍉 ${videoTitle}`
      const playlist = await createPlaylist(token, playlistName)
      if (playlist) {
        await addTracksToPlaylist(token, playlist.id, uris)
        setPlaylistUrl(playlist.url)
      }
    }

    setActiveStep(3)

    // Step 3: Done → transition to success
    await new Promise((r) => setTimeout(r, 800))
    setScreen("success")
  }, [token, songs, videoTitle])

  return (
    <div className="relative flex h-[580px] w-[380px] flex-col overflow-hidden bg-wm-dark">
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
