import type { ComponentPropsWithRef } from "react";

import { cn } from "#frontend/lib/cn.ts";

export function Button({
  className,
  type,
  ...props
}: ComponentPropsWithRef<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "flex items-center justify-center rounded-md bg-primary-1 py-2 px-4 font-bold transition-[transform,color,box-shadow] hover:scale-95 aria-invalid:hover:scale-none cursor-pointer aria-invalid:cursor-auto text-primary-foreground aria-invalid:bg-muted outline-none focus-visible:ring-ring/50 focus-visible:ring-3 border-primary-foreground",
        className
      )}
      {...props}
    />
  );
}
