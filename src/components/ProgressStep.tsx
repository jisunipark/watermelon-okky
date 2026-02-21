import { motion, AnimatePresence } from "framer-motion"
import { Check } from "lucide-react"

interface ProgressStepProps {
  emoji: string
  label: string
  status: "pending" | "active" | "done"
  index: number
}

function BouncingDots() {
  return (
    <span className="ml-1 inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-wm-green"
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  )
}

export function ProgressStep({ emoji, label, status, index }: ProgressStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{
        opacity: 1,
        height: "auto",
      }}
      transition={{ delay: index * 0.15, duration: 0.35 }}
      className="overflow-hidden"
    >
      <div
        className={`flex items-center gap-3 rounded-2xl border p-3 transition-all duration-300 ${
          status === "active"
            ? "border-wm-green/30 bg-wm-green/5"
            : status === "done"
              ? "border-wm-border bg-wm-card"
              : "border-transparent bg-wm-card/50"
        }`}
      >
        <span className="text-base">{emoji}</span>

        <span
          className={`flex-1 text-sm font-medium ${
            status === "active"
              ? "text-white"
              : status === "done"
                ? "text-wm-muted"
                : "text-wm-muted/50"
          }`}
        >
          {label}
          {status === "active" && <BouncingDots />}
        </span>

        <AnimatePresence>
          {status === "done" && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Check className="h-4 w-4 text-wm-green" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
