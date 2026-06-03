export const bounceMotionProps = {
  layout: true,
  initial: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0 },
  transition: {
    duration: 0.3,
    scale: { type: "spring" as const, visualDuration: 0.4, bounce: 0.5 },
  },
} as const;
