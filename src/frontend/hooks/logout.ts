import { useMutation } from "@tanstack/react-query";

import { useErrors } from "#frontend/contexts/error.tsx";

import { useStateActions } from "./state";

export function useLogout() {
  const { addError, clearErrors } = useErrors();
  const { invalidate: invalidateState } = useStateActions();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
    },
    onSuccess: async () => {
      clearErrors();
      await invalidateState();
    },
    onError: (error: Error) => addError(error.message),
  });

  return logoutMutation;
}
