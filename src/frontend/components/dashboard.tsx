import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type ComponentPropsWithRef } from "react";
import { Temporal } from "temporal-polyfill";

import type {
  ErrorResponseBody,
  GetStateResponseBody,
} from "#backend/types.ts";

import {
  stateQueryKey,
  useInvalidateOnStateUpdate,
} from "../hooks/invalidate-on-state-update";
import { CookieForm } from "./cookie-form";
import { ButtonLink } from "./lib/link";
import { Spinner } from "./lib/spinner";
import { NeedHelp } from "./need-help";
import { Status } from "./status";
import { Timer } from "./timer";

export function Dashboard() {
  const [userWantsInputCookie, setUserWantsInputCookie] = useState(false);
  const checkNowMutation = useMutation({
    mutationFn: () => fetch("/update", { method: "POST" }),
  });

  const stateQuery = useQuery({
    queryKey: stateQueryKey,
    queryFn: async () => {
      const response = await fetch("/state");
      const body = (await response.json()) as
        | GetStateResponseBody
        | ErrorResponseBody;
      if (!response.ok) {
        throw new Error(
          `Bad response from GET /state: ${response.status} - ${body}`,
        );
      }
      return body as GetStateResponseBody;
    },
  });
  useInvalidateOnStateUpdate();

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
    !data.currentCookie ||
    (isMamError && data.lastMam?.response.httpStatus !== 429);

  return (
    <>
      <main className="space-y-4">
        <Status data={data} />
        {isMamError && <NeedHelp />}
        {showCookieForm && (
          <CookieForm
            onUpdated={() => {
              setUserWantsInputCookie(false);
              checkNowMutation.mutate();
            }}
            currentCookie={data.currentCookie}
          />
        )}
        {!showCookieForm && data.nextUpdateAt && (
          <Timer
            nextUpdateAt={Temporal.ZonedDateTime.from(data.nextUpdateAt)}
          />
        )}
        <div className="flex items-center justify-center gap-4">
          {!showCookieForm && (
            <>
              <ButtonLink
                onClick={() => setUserWantsInputCookie(true)}
                variant={"muted-primary-background-bright"}
              >
                Set Cookie
              </ButtonLink>
              <ButtonLink
                variant={"muted-primary-background-bright"}
                onClick={() => checkNowMutation.mutate()}
              >
                {checkNowMutation.isPending ? <Spinner /> : "Check Now"}
              </ButtonLink>
            </>
          )}
        </div>
      </main>

      {!showCookieForm && (
        <aside>
          <p className="text-sm text-muted-text text-balance">
            You don't need to keep this window open! Automatic updates will
            occur on the server.
          </p>
        </aside>
      )}
    </>
  );
}

function Center({ ...props }: Readonly<ComponentPropsWithRef<"div">>) {
  return <div {...props} className="flex items-center justify-center" />;
}
