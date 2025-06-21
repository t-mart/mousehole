import type { ComponentPropsWithRef, PropsWithChildren } from "react";

import { motion } from "motion/react";

import { cn } from "#frontend/lib/cn.ts";

export function Section({
  className,
  ...props
}: Readonly<PropsWithChildren<{ className?: string }>>) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.3,
        scale: { type: "spring", visualDuration: 0.4, bounce: 0.5 },
      }}
      className={cn(
        "flex flex-wrap bg-section py-3 px-5 rounded-xl border-2 border-[#fbf0df] transition-colors max-w-prose mx-auto will-change-transform",
        className
      )}
      {...props}
    />
  );
}
