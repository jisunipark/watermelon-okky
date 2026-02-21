import { motion } from "framer-motion"
import type { ReactNode } from "react"

interface PillButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: "green" | "red" | "ghost"
  fullWidth?: boolean
  icon?: ReactNode
}

export function PillButton({
  children,
  onClick,
  variant = "green",
  fullWidth = false,
  icon,
}: PillButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wm-green focus-visible:ring-offset-2 focus-visible:ring-offset-wm-dark"

  const variants = {
    green: "bg-wm-green text-white hover:bg-wm-green/90 shadow-lg shadow-wm-green/20",
    red: "bg-wm-red text-white hover:bg-wm-red/90 shadow-lg shadow-wm-red/20",
    ghost: "bg-transparent text-wm-muted hover:text-white",
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""}`}
    >
      {icon}
      {children}
    </motion.button>
  )
}
