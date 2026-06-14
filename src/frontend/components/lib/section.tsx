import type { PropsWithChildren, Ref } from "react";

import { motion } from "motion/react";

import { cn } from "#frontend/lib/cn.ts";

import { bounceMotionProps } from "./motion";

// `ref` is forwarded to the underlying motion.section so an ancestor
// <AnimatePresence mode="popLayout"> can measure and pop this out of flow on
// exit (lets siblings reclaim the space immediately — see dashboard.tsx).
export function Section({
  className,
  ref,
  ...props
}: Readonly<
  PropsWithChildren<{ className?: string; ref?: Ref<HTMLElement> }>
>) {
  return (
    <motion.section
      ref={ref}
      {...bounceMotionProps}
      className={cn(
        "flex flex-wrap bg-background-dark py-3 px-5 rounded-xl border-2 border-[#fbf0df] transition-colors will-change-transform w-full",
        className,
      )}
      {...props}
    />
  );
}
