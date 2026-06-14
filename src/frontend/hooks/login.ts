import { useMutation } from "@tanstack/react-query";

import { useErrors } from "#frontend/contexts/error.tsx";

import { useStateActions } from "./state";

export function useLogin() {
  const { addError, clearErrors } = useErrors();
  const { invalidate: invalidateState } = useStateActions();

  const loginMutation = useMutation({
    mutationFn: async (value: string) => {
      const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(body?.message ?? "Incorrect password.");
      }
    },
    onSuccess: async () => {
      clearErrors();
      await invalidateState();
    },
    onError: (error: Error) => addError(error.message),
  });

  return loginMutation;
}
