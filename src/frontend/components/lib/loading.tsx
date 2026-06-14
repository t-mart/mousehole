import { type Ref } from "react";

import { cn } from "#frontend/lib/cn.ts";

import { Spinner } from "./spinner";

export function Loading({
  label,
  className,
  spinnerClassName,
  ref,
}: Readonly<{
  label?: string;
  className?: string;
  spinnerClassName?: string;
  ref?: Ref<HTMLDivElement>;
}>) {
  return (
    <div
      ref={ref}
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        className,
      )}
    >
      <Spinner className={cn("size-8", spinnerClassName)} />
      {label ? (
        <p className="text-center text-muted-text">{label}</p>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
    </div>
  );
}
