import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentPropsWithRef } from "react";
import { Temporal } from "temporal-polyfill";

import type {
  ErrorResponseBody,
  GetStateResponseBody,
} from "#backend/types.ts";

import { Cookie } from "./cookie";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { ButtonLink } from "./link";
import { Spinner } from "./spinner";
import { Status } from "./status";
import { Timer } from "./timer";
import { stateQueryKey, useInvalidateOnStateUpdate } from "./use-invalidate-on-state-update";

export function StateSections() {
  const [userWantsInputCookie, setUserWantsInputCookie] = useState(false);
  const queryClient = useQueryClient();

  const stateQuery = useQuery({
    queryKey: stateQueryKey,
    queryFn: async () => {
      const response = await fetch("/state");
      const body = (await response.json()) as
        | GetStateResponseBody
        | ErrorResponseBody;
      if (!response.ok) {
        throw new Error(
          `Bad response from GET /state: ${response.status} - ${body}`
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

  const showCookieForm =
    userWantsInputCookie ||
    !data.currentCookie ||
    (data.lastMam?.response.body.Success === false &&
      data.lastMam?.response.httpStatus !== 429);

  return (
    <>
      <main className="space-y-4">
        <Status data={data} key={`status-${data.lastUpdate?.at}`} />
        {showCookieForm && (
          <Cookie
            onUpdated={() => setUserWantsInputCookie(false)}
            currentCookie={data.currentCookie}
          />
        )}
        {!showCookieForm && data.nextUpdateAt && (
          <Timer
            nextUpdateAt={Temporal.ZonedDateTime.from(data.nextUpdateAt)}
            key={`timer-${data.lastUpdate?.at}`}
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
                onClick={async () => {
                  await fetch("/update", { method: "POST" });
                  queryClient.invalidateQueries({ queryKey: stateQueryKey });
                }}
              >
                Check Now
              </ButtonLink>
            </>
          )}
          <ShowStateResponse data={data} />
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

function ShowStateResponse({ data }: Readonly<{ data: GetStateResponseBody }>) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <ButtonLink variant={"muted-primary-background-bright"}>
          Show Mousehole Response
        </ButtonLink>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mousehole State Response</DialogTitle>
        </DialogHeader>
        <pre className="font-semibold bg-background rounded-lg p-4 w-full overflow-auto">
          {JSON.stringify(data, undefined, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
