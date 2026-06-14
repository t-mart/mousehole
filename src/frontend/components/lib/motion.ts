// A quick, un-bouncy settle for *layout* reflow
export const layoutTransition = {
  type: "tween" as const,
  duration: 0.3,
  ease: "easeOut" as const,
};

// Shared enter/exit for Section boxes. Each phase owns its own timing:
//   - initial: the mount-from state; not animated, so it needs no transition.
//   - animate: springs in — playful bounce on scale, a plain fade on opacity.
//   - exit: snaps out fast and un-bouncy, so a leaving Section (and anything
//     riding on it, e.g. a password-manager overlay) clears quickly.
// The top-level `transition` is now only for `layout` — the reposition of a
// Section and its neighbours when sibling sizes change, which isn't driven by a
// variant. Exit only runs under an <AnimatePresence> with a stable key (see
// dashboard.tsx and app.tsx).
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
