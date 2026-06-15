import type { ComponentPropsWithRef } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#frontend/lib/cn.ts";

import { Spinner } from "./spinner";

const button = cva(
  "flex items-center justify-center rounded-md py-2 px-4 font-bold transition-[transform,color,box-shadow] hover:scale-95 aria-invalid:hover:scale-none cursor-pointer aria-invalid:cursor-auto disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-none outline-none focus-visible:ring-ring/50 focus-visible:ring-3",
  {
    variants: {
      variant: {
        default:
          "bg-primary-background-bright text-primary-text aria-invalid:bg-muted-background",
        ghost:
          "text-muted-text hover:bg-background-light hover:text-text aria-invalid:opacity-50",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({
  className,
  type,
  variant,
  loading = false,
  disabled,
  children,
  ...props
}: ComponentPropsWithRef<"button"> &
  VariantProps<typeof button> & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={cn(button({ variant }), className)}
      // Loading forces disabled (no double-submit) and marks the control busy.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        // Stack label and spinner in one grid cell so the button keeps the
        // label's width while the spinner shows — `invisible` (visibility:hidden)
        // hides the label but still reserves its space, so there's no width jank.
        <span className="grid place-items-center">
          <span className="col-start-1 row-start-1 invisible">{children}</span>
          <Spinner className="col-start-1 row-start-1" />
        </span>
      ) : (
        children
      )}
    </button>
  );
}
