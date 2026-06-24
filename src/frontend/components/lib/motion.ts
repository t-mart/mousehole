/**
 * Motion props for a "quick settle" effect on layout reflow, without any bounce.
 */
export const layoutTransition = {
  type: "tween" as const,
  duration: 0.3,
  ease: "easeOut" as const,
};

/**
 * Motion props for a "bounce" effect on mount and unmount, with a quick settle for layout reflow.
 */
export const bounceMotionProps = {
  layout: true,
  initial: { opacity: 0, scale: 0 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      opacity: { duration: 0.3 },
      scale: { type: "spring", visualDuration: 0.4, bounce: 0.5 },
    },
  },
  exit: {
    opacity: 0,
    scale: 0,
    transition: { duration: 0.12, ease: "easeIn" },
  },
  transition: { layout: layoutTransition },
} as const;
