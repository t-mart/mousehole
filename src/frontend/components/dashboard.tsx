import { useState, type ReactNode } from "react";
import { Temporal } from "temporal-polyfill";

import { useDashboard } from "../hooks/use-dashboard";
import { CookieForm } from "./cookie-form";
import { Button } from "./lib/button";
import { Spinner } from "./lib/spinner";
import { MamResponse } from "./mam-response";
import { NeedHelp } from "./need-help";
import { Timer } from "./timer";

export function Dashboard({ onLogout }: Readonly<{ onLogout: () => void }>) {
  const [userWantsInputCookie, setUserWantsInputCookie] = useState(false);
  const { data, checkNow, isCheckingNow, logout } = useDashboard(onLogout);

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
            checkNow(false);
          }}
          onCancel={() => setUserWantsInputCookie(false)}
          showCancel={data.hasCurrentCookie && !invalidCookie}
        />
      )}

      {/* Providing a key here ensures re-render on timer expiration, good visual feedback for user */}
      {!showCookieForm && !isCheckingNow && data.nextCheckAt && (
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
            onClick={() => checkNow(true)}
            disabled={isCheckingNow}
          >
            {isCheckingNow ? <Spinner /> : "Check Now"}
          </ControlsButton>
        )}
        {data.hasAuth && (
          <ControlsButton key="logout" onClick={logout}>
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
