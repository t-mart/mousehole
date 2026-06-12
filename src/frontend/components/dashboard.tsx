import { useState, type ReactNode } from "react";
import { Temporal } from "temporal-polyfill";

import { classify, type PublicState } from "#shared/public-state.ts";

import { useDashboard } from "../hooks/use-dashboard";
import { CookieForm } from "./cookie-form";
import { Button } from "./lib/button";
import { Spinner } from "./lib/spinner";
import { MamResponse } from "./mam-response";
import { NeedHelp } from "./need-help";
import { Timer } from "./timer";

// The dashboard is in one of two mutually-exclusive modes: collecting a usable
// cookie via the form ("cookie-setup"), or running normally with one
// ("running"). `panel` captures which, and the orthogonal `showNeedHelp` flag
// rides alongside since the help text can appear in either mode. Extracting
// this into a separate function helps confine all the boolean logic for this in
// one place.
function getDashboardView(
  data: PublicState,
  userWantsInputCookie: boolean,
): {
  showNeedHelp: boolean;
  panel: { kind: "cookie-setup"; showCancel: boolean } | { kind: "running" };
} {
  const status = classify(data.lastMamContact);
  const rejected = status === "rejected"; // 403 — the cookie/session is bad
  const mamProblem = rejected || status === "throttled"; // MAM returned Success:false

  const needsCookieForm =
    userWantsInputCookie || !data.hasCookie || rejected;

  return {
    showNeedHelp: mamProblem,
    panel: needsCookieForm
      ? { kind: "cookie-setup", showCancel: data.hasCookie && !rejected }
      : { kind: "running" },
  };
}

export function Dashboard({ onLogout }: Readonly<{ onLogout: () => void }>) {
  const [userWantsInputCookie, setUserWantsInputCookie] = useState(false);
  const { data, checkNow, isCheckingNow, logout } = useDashboard(onLogout);

  if (!data) return;

  const { showNeedHelp, panel } = getDashboardView(data, userWantsInputCookie);

  return (
    <>
      <MamResponse data={data} />

      {showNeedHelp && <NeedHelp />}

      {panel.kind === "cookie-setup" && (
        <CookieForm
          onUpdate={() => setUserWantsInputCookie(false)}
          onCancel={() => setUserWantsInputCookie(false)}
          showCancel={panel.showCancel}
        />
      )}

      {/* Providing a key here ensures re-render on timer expiration, good visual feedback for user */}
      {panel.kind === "running" && !isCheckingNow && data.nextCheckAt && (
        <Timer
          nextCheckAt={Temporal.ZonedDateTime.from(data.nextCheckAt)}
          key={data.nextCheckAt}
        />
      )}

      <div className="flex items-center justify-center gap-4">
        {panel.kind === "running" && (
          <>
            <ControlsButton
              key="set-cookie"
              onClick={() => setUserWantsInputCookie(true)}
            >
              Set Cookie
            </ControlsButton>
            <ControlsButton
              key="check-now"
              onClick={() => checkNow()}
              disabled={isCheckingNow}
            >
              {isCheckingNow ? <Spinner /> : "Check Now"}
            </ControlsButton>
          </>
        )}
        {data.hasAuth && (
          <ControlsButton key="logout" onClick={logout}>
            Log out
          </ControlsButton>
        )}
      </div>

      {panel.kind === "running" && (
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
