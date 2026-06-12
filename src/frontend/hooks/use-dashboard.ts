import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PublicState } from "#shared/public-state.ts";

import { useErrors } from "#frontend/lib/error-context.tsx";
import {
  stateQueryFunction,
  stateQueryKey,
  stateQueryRetry,
} from "#frontend/lib/state-query.ts";

import { useServerEvents } from "./use-server-events";

/**
 * Bundles the dashboard's server interactions: fetches and live-syncs the server
 * state, exposes the "update now" and "log out" actions, and surfaces failed
 * requests as errors. The component is left to render whatever this returns.
 */
export function useDashboard(onLogout: () => void) {
  const { addError } = useErrors();
  const queryClient = useQueryClient();

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
    onSuccess: (data) => queryClient.setQueryData(stateQueryKey, data),
    onError: (error: Error) => addError(error.message),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
    },
    onSuccess: onLogout,
    onError: (error: Error) => addError(error.message),
  });

  const stateQuery = useQuery({
    queryKey: stateQueryKey,
    queryFn: stateQueryFunction,
    retry: stateQueryRetry,
  });
  useServerEvents();

  return {
    data: stateQuery.data,
    updateNow: () => updateNowMutation.mutate(),
    isUpdatingNow: updateNowMutation.isPending,
    logout: () => logoutMutation.mutate(),
  };
}
