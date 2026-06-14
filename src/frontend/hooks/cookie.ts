import { useMutation } from "@tanstack/react-query";

import type { PublicState } from "#shared/public-state.ts";

import { useErrors } from "#frontend/contexts/error.tsx";

import { useStateActions } from "./state";

export function useCookie({ onSetSuccess }: { onSetSuccess: () => void }) {
  const { addError, clearErrors } = useErrors();
  const { setData: setState } = useStateActions();

  const cookieMutation = useMutation({
    // PUT /cookie sets the credential and contacts MAM in one shot, returning the
    // resulting state — so the status (incl. a bad-cookie rejection) shows at once.
    mutationFn: async (cookie: string) => {
      const response = await fetch("/cookie", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: cookie }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(body?.message ?? "Failed to save cookie.");
      }
      return (await response.json()) as PublicState;
    },
    onSuccess: (newState) => {
      clearErrors();
      setState(newState);
      onSetSuccess();
    },
    onError: (error: Error) => addError(error.message),
  });

  return cookieMutation;
}
