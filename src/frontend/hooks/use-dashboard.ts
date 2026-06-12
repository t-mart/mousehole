import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PublicState } from "#shared/public-state.ts";

import { useErrors } from "#frontend/lib/error-context.tsx";
import {
  stateQueryFunction,
  stateQueryKey,
  UnauthenticatedError,
} from "#frontend/lib/state-query.ts";

import { useServerEvents } from "./use-server-events";

/**
 * Bundles the dashboard's server interactions: fetches and live-syncs the server
 * state, exposes the "check now" and "log out" actions, and surfaces failed
 * requests as errors. The component is left to render whatever this returns.
 */
export function useDashboard(onLogout: () => void) {
  const { addError } = useErrors();
  const queryClient = useQueryClient();

  const checkNowMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/checks", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(
          `${body?.message ?? "Check failed."} Check server logs for details.`,
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
    retry: (_, error) => !(error instanceof UnauthenticatedError),
  });
  useServerEvents();

  return {
    data: stateQuery.data,
    checkNow: () => checkNowMutation.mutate(),
    isCheckingNow: checkNowMutation.isPending,
    logout: () => logoutMutation.mutate(),
  };
}
