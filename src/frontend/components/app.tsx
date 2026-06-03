import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { type ReactNode } from "react";

import { useErrors } from "#frontend/lib/error-context.tsx";

import {
  stateQueryFunction,
  stateQueryKey,
  UnauthenticatedError,
} from "../hooks/invalidate-on-state-update";
import { Dashboard } from "./dashboard";
import { ErrorDisplay } from "./error-display";
import { Footer } from "./footer";
import { Header } from "./header";
import { Button } from "./lib/button";
import { Section } from "./lib/section";
import { Spinner } from "./lib/spinner";
import { LoginForm } from "./login-form";

function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { errors } = useErrors();
  return (
    <div className="mx-auto my-0 p-8 text-center relative z-10 space-y-8 max-w-prose w-full">
      <Header />
      {errors.length > 0 && <ErrorDisplay />}
      <main className="space-y-4">
        <AnimatePresence>{children}</AnimatePresence>
      </main>
      <Footer />
    </div>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const stateQuery = useQuery({
    queryKey: stateQueryKey,
    queryFn: stateQueryFunction,
    retry: (_, error) => !(error instanceof UnauthenticatedError),
  });

  function handleLogout() {
    void queryClient.invalidateQueries({ queryKey: stateQueryKey });
  }

  if (stateQuery.isPending) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center">
          <Spinner className="size-32" />
        </div>
      </AppLayout>
    );
  }

  if (stateQuery.error instanceof UnauthenticatedError) {
    return (
      <AppLayout>
        <LoginForm />
      </AppLayout>
    );
  }

  if (stateQuery.isError) {
    return (
      <AppLayout>
        <Section className="flex-col items-center gap-4">
          <p className="text-destructive">{stateQuery.error.message}</p>
          <Button
            onClick={() => {
              void stateQuery.refetch();
            }}
          >
            Retry
          </Button>
        </Section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Dashboard onLogout={handleLogout} />
    </AppLayout>
  );
}

export default App;
