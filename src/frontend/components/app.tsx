import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type JSX } from "react";

import {
  stateQueryFunction,
  stateQueryKey,
  UnauthenticatedError,
} from "../hooks/invalidate-on-state-update";
import { Dashboard } from "./dashboard";
import { Footer } from "./footer";
import { Header } from "./header";
import { Spinner } from "./lib/spinner";
import { LoginPage } from "./login-page";

type AuthState = "loading" | "authenticated" | "unauthenticated";

export function App() {
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    queryClient
      .fetchQuery({ queryKey: stateQueryKey, queryFn: stateQueryFunction })
      .then(() => setAuthState("authenticated"))
      .catch((error) =>
        setAuthState(
          error instanceof UnauthenticatedError ? "unauthenticated" : "authenticated",
        ),
      );
  }, [queryClient]);

  function handleLogin() {
    setAuthState("authenticated");
    queryClient.invalidateQueries({ queryKey: stateQueryKey });
  }

  function handleLogout() {
    // Set state synchronously before any render — the WebSocket cannot race this.
    setAuthState("unauthenticated");
    queryClient.removeQueries({ queryKey: stateQueryKey });
  }

  let main: JSX.Element;
  if (authState === "loading") {
    main = (
      <div className="flex items-center justify-center">
        <Spinner className="size-32" />
      </div>
    );
  } else if (authState === "unauthenticated") {
    main = <LoginPage onLogin={handleLogin} />;
  } else {
    main = <Dashboard onLogout={handleLogout} />;
  }

  return (
    <div className="mx-auto my-0 p-8 text-center relative z-10 space-y-8 max-w-prose w-full">
      <Header />
      {main}
      <Footer />
    </div>
  );
}

export default App;
