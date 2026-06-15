import type { ComponentPropsWithRef } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#frontend/lib/cn.ts";

const linkVariants = cva(
  "font-semibold underline underline-offset-3 hover:decoration-[20%] focus-ring transition-colors duration-300",
  {
    variants: {
      variant: {
        default: "hover:text-primary-background-dark",
        disco: "disco-text-hover",
        "muted-destructive": "text-muted-text hover:text-destructive/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Link({
  className,
  variant,
  ...props
}: Readonly<ComponentPropsWithRef<"a"> & VariantProps<typeof linkVariants>>) {
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  return <a className={cn(linkVariants({ variant, className }))} {...props} />;
}