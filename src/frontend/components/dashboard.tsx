import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { Temporal } from "temporal-polyfill";

import {
  stateQueryFunction,
  stateQueryKey,
  UnauthenticatedError,
  useInvalidateOnStateUpdate,
} from "../hooks/invalidate-on-state-update";
import { CookieForm } from "./cookie-form";
import { ButtonLink } from "./lib/link";
import { Spinner } from "./lib/spinner";
import { MamResponse } from "./mam-response";
import { NeedHelp } from "./need-help";
import { Timer } from "./timer";

export function Dashboard({ onLogout }: Readonly<{ onLogout: () => void }>) {
  const [userWantsInputCookie, setUserWantsInputCookie] = useState(false);
  const checkNowMutation = useMutation({
    mutationFn: (force: boolean) =>
      fetch("/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      }),
  });
  const logoutMutation = useMutation({
    mutationFn: () => fetch("/logout", { method: "POST" }),
    onSuccess: onLogout,
  });

  const stateQuery = useQuery({
    queryKey: stateQueryKey,
    queryFn: stateQueryFunction,
    retry: (_, error) => !(error instanceof UnauthenticatedError),
  });
  useInvalidateOnStateUpdate({ onSessionExpired: onLogout });

  useEffect(() => {
    if (stateQuery.error instanceof UnauthenticatedError) onLogout();
  }, [stateQuery.error, onLogout]);

  if (stateQuery.isPending) {
    return (
      <Center>
        <Spinner className="size-32" />
      </Center>
    );
  }

  if (stateQuery.isError) {
    return (
      <Center>
        <p className="text-destructive">
          Error fetching state: {stateQuery.error.message || "Unknown error"}
        </p>
      </Center>
    );
  }

  const data = stateQuery.data;

  const isMamError = data.lastMam?.response.body.Success === false;

  const showCookieForm =
    userWantsInputCookie ||
    !data.hasCurrentCookie ||
    (isMamError && data.lastMam?.response.httpStatus !== 429);

  return (
    <>
      <main className="space-y-4">
        <MamResponse data={data} />

        {isMamError && <NeedHelp />}

        {showCookieForm && (
          <CookieForm
            onUpdated={() => {
              setUserWantsInputCookie(false);
              checkNowMutation.mutate(false);
            }}
          />
        )}

        {/* Providing a key here ensures re-render on timer expiration, good visual feedback for user */}
        {!showCookieForm &&
          !checkNowMutation.isPending &&
          data.nextUpdateAt && (
            <Timer
              nextUpdateAt={Temporal.ZonedDateTime.from(data.nextUpdateAt)}
              key={data.nextUpdateAt}
            />
          )}

        <div className="flex items-center justify-center gap-4">
          {!showCookieForm && (
            <>
              <AnimatedButton onClick={() => setUserWantsInputCookie(true)}>
                Set Cookie
              </AnimatedButton>
              <AnimatedButton
                show={!checkNowMutation.isPending}
                onClick={() => checkNowMutation.mutate(true)}
              >
                Check Now
              </AnimatedButton>
            </>
          )}
          {data.hasAuth && (
            <AnimatedButton onClick={() => logoutMutation.mutate()}>
              Log out
            </AnimatedButton>
          )}
        </div>
      </main>

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

function Center({ ...props }: Readonly<ComponentPropsWithRef<"div">>) {
  return <div {...props} className="flex items-center justify-center" />;
}

function AnimatedButton({
  show = true,
  onClick,
  children,
}: Readonly<{
  show?: boolean;
  onClick: () => void;
  children: ReactNode;
}>) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{
            duration: 0.3,
            scale: { type: "spring", visualDuration: 0.4, bounce: 0.5 },
          }}
        >
          <ButtonLink
            variant={"muted-primary-background-bright"}
            onClick={onClick}
          >
            {children}
          </ButtonLink>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
