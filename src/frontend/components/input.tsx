import * as React from "react";

import { cn } from "#frontend/lib/cn.ts";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "placeholder:text-muted-foreground border-input flex h-9 w-full min-w-10 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "border-primary-1 focus-visible:ring-ring/50 focus-visible:ring-3",
        "aria-invalid:ring-destructive/50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
