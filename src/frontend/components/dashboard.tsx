import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Temporal } from "temporal-polyfill";

import { useErrors } from "#frontend/lib/error-context.tsx";

import { useServerEvents } from "../hooks/use-server-events";
import {
  stateQueryFunction,
  stateQueryKey,
  UnauthenticatedError,
} from "../lib/state-query";
import { CookieForm } from "./cookie-form";
import { Button } from "./lib/button";
import { Spinner } from "./lib/spinner";
import { MamResponse } from "./mam-response";
import { NeedHelp } from "./need-help";
import { Timer } from "./timer";

export function Dashboard({ onLogout }: Readonly<{ onLogout: () => void }>) {
  const [userWantsInputCookie, setUserWantsInputCookie] = useState(false);
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

  if (!data) return;

  const isMamError = data.lastMam?.response.body.Success === false;
  const invalidCookie =
    isMamError &&
    data.lastMam?.response.body.msg === "Invalid session - Invalid Cookie";

  const showCookieForm =
    userWantsInputCookie ||
    !data.hasCurrentCookie ||
    (isMamError && data.lastMam?.response.httpStatus !== 429);

  return (
    <>
      <MamResponse data={data} />

      {isMamError && <NeedHelp />}

      {showCookieForm && (
        <CookieForm
          onUpdate={() => {
            setUserWantsInputCookie(false);
            checkNowMutation.mutate(false);
          }}
          onCancel={() => setUserWantsInputCookie(false)}
          showCancel={data.hasCurrentCookie && !invalidCookie}
        />
      )}

      {/* Providing a key here ensures re-render on timer expiration, good visual feedback for user */}
      {!showCookieForm && !checkNowMutation.isPending && data.nextCheckAt && (
        <Timer
          nextCheckAt={Temporal.ZonedDateTime.from(data.nextCheckAt)}
          key={data.nextCheckAt}
        />
      )}

      <div className="flex items-center justify-center gap-4">
        {!showCookieForm && (
          <ControlsButton
            key="set-cookie"
            onClick={() => setUserWantsInputCookie(true)}
          >
            Set Cookie
          </ControlsButton>
        )}
        {!showCookieForm && (
          <ControlsButton
            key="check-now"
            onClick={() => checkNowMutation.mutate(true)}
            disabled={checkNowMutation.isPending}
          >
            {checkNowMutation.isPending ? <Spinner /> : "Check Now"}
          </ControlsButton>
        )}
        {data.hasAuth && (
          <ControlsButton key="logout" onClick={() => logoutMutation.mutate()}>
            Log out
          </ControlsButton>
        )}
      </div>

      {!showCookieForm && (
        <aside>
          <p className="text-sm text-muted-text text-balance">
            You don't need to keep this page open! Automatic updates will occur
            on the server.
          </p>
        </aside>
      )}
    </>
  );
}

function ControlsButton({
  onClick,
  disabled,
  children,
}: Readonly<{
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}>) {
  return (
    <Button variant="ghost" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}
