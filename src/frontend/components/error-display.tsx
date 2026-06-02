import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useErrors } from "#frontend/lib/error-context.tsx";

export function ErrorDisplay() {
  const { errors, dismissError } = useErrors();

  return (
    <AnimatePresence>
      {errors.map((error) => (
        <motion.div
          key={error.id}
          layout
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{
            duration: 0.3,
            scale: { type: "spring", visualDuration: 0.4, bounce: 0.5 },
          }}
          className="flex bg-background-dark py-3 px-5 rounded-xl border-2 border-destructive will-change-transform w-full items-center justify-between gap-4"
        >
          <p className="text-destructive text-sm text-left">{error.message}</p>
          <button
            onClick={() => dismissError(error.id)}
            aria-label="Dismiss error"
            className="text-destructive/60 hover:text-destructive transition-colors shrink-0 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
