import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
} from "react";
import { Temporal } from "temporal-polyfill";

import type {
  ErrorResponseBody,
  GetStateResponseBody,
} from "#backend/types.ts";

import { version } from "../../../package.json";
import { Cookie } from "./cookie";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { ButtonLink, Link } from "./link";
import { Spinner } from "./spinner";
import { Status } from "./status";
import { Timer } from "./timer";

export const stateQueryKey: readonly [string] = ["state"];
const heartbeatIntervalMilliseconds = 30_000;
const reconnectDelayMilliseconds = 3000;

export function App() {
  return (
    <div className="mx-auto my-0 p-8 text-center relative z-10 space-y-8 max-w-prose w-full">
      <header className="space-y-2 w-full">
        <h1 className="font-bold text-5xl">Mousehole</h1>
        <p>
          Keep your{" "}
          <Link href="https://www.myanonamouse.net/" target="_blank">
            Myanonamouse
          </Link>{" "}
          seedbox IP updated.
        </p>
      </header>
      <StateSections />
      <footer className="@container space-y-2">
        <ol className="flex justify-between flex-col @xs:flex-row flex-wrap gap-2">
          <li>
            <Link
              href="https://www.myanonamouse.net/f/t/84712/p/p1013257"
              target="_blank"
            >
              Forum Post
            </Link>
          </li>
          <li>
            <Link href="https://github.com/t-mart/mousehole" target="_blank">
              GitHub
            </Link>
          </li>
          <li>
            <Link
              href="https://hub.docker.com/r/tmmrtn/mousehole"
              target="_blank"
            >
              Docker Hub
            </Link>
          </li>
        </ol>
        <div>
          Mousehole v{version} by{" "}
          <Link href="https://www.myanonamouse.net/u/252061" target="_blank">
            timtimtim
          </Link>
        </div>
      </footer>
    </div>
  );
}

function StateSections() {
  const [userWantsInputCookie, setUserWantsInputCookie] = useState(false);

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
                onClick={() => fetch("/update", { method: "POST" })}
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

function useInvalidateOnStateUpdate() {
  const queryClient = useQueryClient();
  const websocketRef = useRef<WebSocket | undefined>(undefined);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const connect = useCallback(() => {
    const websocket = new WebSocket("/web/ws");
    websocketRef.current = websocket;

    function handleOpen() {
      clearTimeout(reconnectTimeoutRef.current);
      heartbeatRef.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send("ping");
        }
      }, heartbeatIntervalMilliseconds);
    }

    function handleMessage(event: MessageEvent<string>) {
      const { data } = event;
      switch (data) {
        case "pong": {
          break;
        }
        case "state-update": {
          queryClient.invalidateQueries({ queryKey: stateQueryKey });
          break;
        }
        default: {
          console.warn("Unknown message from WebSocket:", data);
        }
      }
    }

    function handleClose() {
      clearInterval(heartbeatRef.current);
      reconnectTimeoutRef.current = setTimeout(
        connect,
        reconnectDelayMilliseconds
      );
    }

    function handleError(event: Event) {
      console.error("WebSocket error:", event);
    }

    websocket.addEventListener("open", handleOpen);
    websocket.addEventListener("message", handleMessage);
    websocket.addEventListener("close", handleClose);
    websocket.addEventListener("error", handleError);

    return () => {
      websocket.removeEventListener("open", handleOpen);
      websocket.removeEventListener("message", handleMessage);
      websocket.removeEventListener("close", handleClose);
      websocket.removeEventListener("error", handleError);
    };
  }, [queryClient]);

  useEffect(() => {
    const cleanup = connect();

    return () => {
      clearInterval(heartbeatRef.current);
      clearTimeout(reconnectTimeoutRef.current);

      const ws = websocketRef.current;
      if (ws) {
        cleanup();
        ws.close();
      }
      websocketRef.current = undefined;
    };
  }, [connect, queryClient]);
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

export default App;
