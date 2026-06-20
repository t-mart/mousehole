import { X } from "lucide-react";

import { useErrors } from "#frontend/contexts/error.tsx";

import { Button } from "./lib/button";

export function ErrorDisplay() {
  const { errors, dismissError } = useErrors();

  return (
    <aside>
      <ol className="flex flex-col gap-y-2">
        {errors.map((error) => (
          <li
            key={error.id}
            // Announces the banner when it appears (and re-announces when
            // the repeat count changes).
            role="alert"
            className="flex bg-background-dark py-3 px-5 rounded-xl border-2 border-destructive will-change-transform w-full items-center justify-between gap-4"
          >
            <p className="text-destructive text-sm text-left">
              {error.message}
              {error.count > 1 && (
                <span className="text-destructive/60"> (×{error.count})</span>
              )}
            </p>
            <Button
              type="button"
              variant="ghost-destructive"
              size="icon"
              onClick={() => dismissError(error.id)}
              aria-label="Dismiss error"
              className="shrink-0"
            >
              <X className="size-4 stroke-4" />
            </Button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
