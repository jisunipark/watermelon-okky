import { motion } from "framer-motion"

interface SongCardProps {
  index: number
  title: string
  artist: string
  confidence: "matched" | "uncertain"
}

export function SongCard({ index, title, artist, confidence }: SongCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className="flex items-center gap-3 rounded-2xl border border-wm-border bg-wm-card p-3 shadow-lg shadow-black/40"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-wm-muted">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        <p className="truncate text-xs text-wm-muted">{artist}</p>
      </div>

      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          confidence === "matched"
            ? "bg-wm-green shadow-sm shadow-wm-green/50"
            : "bg-yellow-500 shadow-sm shadow-yellow-500/50"
        }`}
        aria-label={confidence === "matched" ? "Matched on Spotify" : "Uncertain match"}
      />
    </motion.div>
  )
}
