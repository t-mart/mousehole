import { X } from "lucide-react";

import { useErrors } from "#frontend/lib/error-context.tsx";

export function ErrorDisplay() {
  const { errors, dismissError } = useErrors();

  return (
    <aside>
      <ol className="flex flex-col gap-y-2">
        {errors.map((error) => (
          <li
            key={error.id}
            className="flex bg-background-dark py-3 px-5 rounded-xl border-2 border-destructive will-change-transform w-full items-center justify-between gap-4"
          >
            <p className="text-destructive text-sm text-left">
              {error.message}
            </p>
            <button
              onClick={() => dismissError(error.id)}
              aria-label="Dismiss error"
              className="text-destructive/60 hover:text-destructive transition-colors shrink-0 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
