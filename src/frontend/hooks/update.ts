import { useMutation } from "@tanstack/react-query";

import type { PublicState } from "#shared/public-state.ts";

import { useErrors } from "#frontend/contexts/error.tsx";

import { useStateActions } from "./state";

export function useUpdate() {
  const { addError, clearErrors } = useErrors();
  const { setData: setState } = useStateActions();

  const updateNowMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/updates", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(
          `${body?.message ?? "Update failed."} Check server logs for details.`,
        );
      }
      return (await response.json()) as PublicState;
    },
    onSuccess: (newState) => {
      clearErrors();
      setState(newState);
    },
    onError: (error: Error) => addError(error.message),
  });

  return updateNowMutation;
}
