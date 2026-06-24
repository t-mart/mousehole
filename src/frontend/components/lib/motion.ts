/**
 * A quick, un-bouncy settle for layout reflow.
 */
export const layoutTransition = {
  type: "tween" as const,
  duration: 0.3,
  ease: "easeOut" as const,
};

/**
 * Scale-and-fade bounce for mount and unmount inside an <AnimatePresence>. No
 * layout animation, so it suits an element that doesn't reflow its neighbors,
 * such as a tooltip.
 */
export const bounceProps = {
  initial: { opacity: 0, scale: 0 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      opacity: { duration: 0.3 },
      scale: { type: "spring", visualDuration: 0.3, bounce: 0.5 },
    },
  },
  exit: {
    opacity: 0,
    scale: 0,
    transition: { duration: 0.12, ease: "easeIn" },
  },
} as const;

/**
 * `bounceProps` plus a layout animation, for an element whose entrance and exit
 * reflow its siblings (dashboard Sections under popLayout). `layoutTransition`
 * tunes that reflow.
 */
export const layoutBounceProps = {
  ...bounceProps,
  layout: true,
  transition: { layout: layoutTransition },
} as const;
