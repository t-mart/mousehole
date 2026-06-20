import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";

import { useLogout } from "#frontend/hooks/logout.ts";
import { useServerEvents } from "#frontend/hooks/server-events.ts";
import { useUpdate } from "#frontend/hooks/update.ts";
import { classify, type PublicState } from "#shared/public-state.ts";

import { CookieForm } from "./cookie-form";
import { Button } from "./lib/button";
import { MamResponse } from "./mam-response";
import { NeedHelp } from "./need-help";

function getDashboardState(data: PublicState, userWantsInputCookie: boolean) {
  const status = classify(data.lastMamContact);
  const rejected = status === "rejected"; // 403 — the cookie/session is bad
  const showNeedHelp = rejected || status === "throttled";

  return {
    showCookieForm:
      userWantsInputCookie || // they pressed the button to show it, or
      !data.hasCookie || // the server says they have no cookie on file, or
      rejected, // MAM says the cookie on file ain't no gud
    showCookieFormCancelButton: data.hasCookie && !rejected, // only show the cancel button if there's a cookie to cancel to
    showNeedHelp,
    showOkTip: status === "ok",
  };
}

export function Dashboard({ state }: { state: PublicState }) {
  const [userWantsCookieInput, setUserWantsCookieInput] = useState(false);
  useServerEvents();
  const { mutate: update, isPending: isUpdatePending } = useUpdate();
  const { mutate: logout, isPending: isLogoutPending } = useLogout();

  const {
    showCookieForm,
    showCookieFormCancelButton,
    showNeedHelp,
    showOkTip,
  } = getDashboardState(state, userWantsCookieInput);

  return (
    <AnimatePresence mode="popLayout">
      <MamResponse key={state.nextContactAt ?? "mam-response"} state={state} />

      {showNeedHelp && <NeedHelp key="need-help" />}

      {showCookieForm && (
        <CookieForm
          key="cookie-form"
          onSetSuccess={() => setUserWantsCookieInput(false)}
          onCancel={() => setUserWantsCookieInput(false)}
          showCancel={showCookieFormCancelButton}
        />
      )}

      <motion.div
        key="controls"
        layout
        className="flex items-center justify-center gap-4"
      >
        {!showCookieForm && (
          <>
            <ControlsButton onClick={() => setUserWantsCookieInput(true)}>
              Set Cookie
            </ControlsButton>
            <ControlsButton onClick={() => update()} loading={isUpdatePending}>
              Update Now
            </ControlsButton>
          </>
        )}
        {state.hasAuth && (
          <ControlsButton onClick={() => logout()} loading={isLogoutPending}>
            Log out
          </ControlsButton>
        )}
      </motion.div>

      {showOkTip && (
        <motion.aside
          key="running-tip"
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <p className="text-sm text-muted-text text-balance">
            You don't need to keep this page open! Automatic updates will occur
            on the server.
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function ControlsButton({
  onClick,
  loading,
  children,
}: Readonly<{
  onClick: () => void;
  loading?: boolean;
  children: ReactNode;
}>) {
  return (
    <Button variant="ghost" onClick={onClick} loading={loading}>
      {children}
    </Button>
  );
}
