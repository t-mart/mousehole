import {
  AnimatePresence,
  LayoutGroup,
  motion,
  MotionConfig,
} from "motion/react";
import { type ReactNode, type Ref } from "react";

import { useErrors } from "#frontend/contexts/error.tsx";
import { useStateQuery } from "#frontend/hooks/state.ts";

import { Dashboard } from "./dashboard";
import { ErrorDisplay } from "./error-display";
import { Footer } from "./footer";
import { Header } from "./header";
import { Button } from "./lib/button";
import { Loading } from "./lib/loading";
import { layoutTransition } from "./lib/motion";
import { Section } from "./lib/section";
import { LoginForm } from "./login-form";

export function App() {
  const { errors } = useErrors();
  // The state query lives here, above <AnimatePresence>, on purpose: the
  // presence/layout machinery remounts its subtree as content swaps, and a
  // query observer mounted *inside* it would be torn down and restarted on
  // every swap — an endless pending→error→remount loop. Keep it in this stable
  // parent and feed the result down as already-resolved content.
  const {
    isPending,
    isError,
    error,
    isAuthError,
    refetch,
    data,
    isRefetching,
  } = useStateQuery();

  let content: ReactNode;
  if (isPending) {
    content = <Loading key="loading" spinnerClassName="size-32" />;
  } else if (isError) {
    content = isAuthError ? (
      <LoginForm key="login" />
    ) : (
      <StateQueryErrorDisplay
        key="error"
        error={error}
        onRetry={() => {
          void refetch();
        }}
        isRetrying={isRefetching}
      />
    );
  } else {
    content = <Dashboard key="dashboard" state={data} />;
  }

  return (
    <MotionConfig transition={layoutTransition}>
      <LayoutGroup>
        <motion.div
          layout
          className="mx-auto my-0 p-8 text-center relative z-10 space-y-8 max-w-prose w-full"
        >
          <Header />
          {errors.length > 0 && <ErrorDisplay />}
          <motion.main layout className="relative space-y-4">
            <AnimatePresence mode="popLayout">{content}</AnimatePresence>
          </motion.main>
          <Footer />
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}

function StateQueryErrorDisplay({
  error,
  onRetry,
  isRetrying,
  ref,
}: {
  error: Error;
  onRetry: () => void;
  isRetrying: boolean;
  ref?: Ref<HTMLElement>;
}) {
  if (isRetrying) {
    return <Loading key="loading" spinnerClassName="size-32" />;
  }
  return (
    <Section ref={ref} className="flex-col items-center gap-4">
      <p className="text-destructive">{error.message}</p>
      <Button onClick={onRetry}>Retry</Button>
    </Section>
  );
}
