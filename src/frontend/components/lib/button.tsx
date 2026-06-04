import type { ComponentPropsWithRef } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#frontend/lib/cn.ts";

const button = cva(
  "flex items-center justify-center rounded-md py-2 px-4 font-bold transition-[transform,color,box-shadow] hover:scale-95 aria-invalid:hover:scale-none cursor-pointer aria-invalid:cursor-auto disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-none outline-none focus-visible:ring-ring/50 focus-visible:ring-3",
  {
    variants: {
      variant: {
        default:
          "bg-primary-background-dark text-primary-text aria-invalid:bg-muted-background",
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
  ...props
}: ComponentPropsWithRef<"button"> & VariantProps<typeof button>) {
  return (
    <button
      type={type}
      className={cn(button({ variant }), className)}
      {...props}
    />
  );
}
