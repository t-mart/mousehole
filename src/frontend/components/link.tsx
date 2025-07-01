import type { ComponentPropsWithRef } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#frontend/lib/cn.ts";

const linkVariants = cva(
  "font-semibold underline outline-none underline-offset-3 hover:decoration-[20%] rounded-md focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:ring-offset-4 focus-visible:ring-offset-background transition-[color,box-shadow]",
  {
    variants: {
      variant: {
        default: "hover:text-primary-2",
        "muted-destructive": "text-muted-foreground hover:text-destructive/80",
        "muted-primary-2": "text-muted-foreground hover:text-primary-2",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export function Link({
  className,
  variant,
  ...props
}: Readonly<ComponentPropsWithRef<"a"> & VariantProps<typeof linkVariants>>) {
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  return <a className={cn(linkVariants({ variant, className }))} {...props} />;
}

export function ButtonLink({
  className,
  variant,
  type,
  ...props
}: Readonly<
  ComponentPropsWithRef<"button"> & VariantProps<typeof linkVariants>
>) {
  return (
    <button
      type={type}
      className={cn(
        linkVariants({ variant, className: ` cursor-pointer ${className}` })
      )}
      {...props}
    />
  );
}
