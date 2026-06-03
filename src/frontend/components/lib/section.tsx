import type { PropsWithChildren } from "react";

import { motion } from "motion/react";

import { cn } from "#frontend/lib/cn.ts";

import { bounceMotionProps } from "./motion";

export function Section({
  className,
  ...props
}: Readonly<PropsWithChildren<{ className?: string }>>) {
  return (
    <motion.section
      {...bounceMotionProps}
      className={cn(
        "flex flex-wrap bg-background-dark py-3 px-5 rounded-xl border-2 border-[#fbf0df] transition-colors will-change-transform w-full",
        className,
      )}
      {...props}
    />
  );
}
