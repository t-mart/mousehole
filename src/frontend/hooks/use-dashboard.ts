import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useErrors } from "#frontend/lib/error-context.tsx";
import {
  stateQueryFunction,
  stateQueryKey,
  UnauthenticatedError,
} from "#frontend/lib/state-query.ts";

import { useServerEvents } from "./use-server-events";

/**
 * Bundles the dashboard's server interactions: fetches and live-syncs the
 * server state, exposes the "check now" and "log out" actions, and surfaces
 * connectivity problems as errors. The component is left to render whatever
 * this returns.
 */
export function useDashboard(onLogout: () => void) {
  const { addError } = useErrors();

  const checkNowMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const response = await fetch("/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(
          `${body?.message ?? "Update check failed."} Check server logs for details.`,
        );
      }
    },
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
  useServerEvents({ onSessionExpired: onLogout });

  const data = stateQuery.data;

  useEffect(() => {
    if (data?.isOnline === false) {
      addError(
        "The server is unable to contact MAM. Check server logs for details.",
      );
    }
  }, [data?.isOnline, addError]);

  return {
    data,
    checkNow: (force: boolean) => checkNowMutation.mutate(force),
    isCheckingNow: checkNowMutation.isPending,
    logout: () => logoutMutation.mutate(),
  };
}