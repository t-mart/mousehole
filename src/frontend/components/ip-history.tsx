import { ChevronDown } from "lucide-react";
import { useId, useRef } from "react";
import { Temporal } from "temporal-polyfill";

import type { SerializedNetworkChange } from "#shared/public-state.ts";

import { useDashedIdent } from "#frontend/hooks/dashed-ident.ts";
import { relativeDate } from "#frontend/lib/date.ts";

// The absolute, human-readable form shown in the hover/focus tooltip.
function formatAt(at: Temporal.ZonedDateTime): string {
  return at.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// HTML's `datetime` attribute wants a valid global date-and-time string; drop the
// RFC 9557 "[time zone]" annotation our `at` carries, keeping the numeric offset.
function dateTimeAttribute(at: Temporal.ZonedDateTime): string {
  return at.toString({ timeZoneName: "never" });
}

function RelativeTime({ at }: Readonly<{ at: Temporal.ZonedDateTime }>) {
  const anchorName = useDashedIdent("history-time");
  const tooltipId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const exact = formatAt(at);

  // showPopover/hidePopover throw if the popover is already in that state, so
  // guard on :popover-open.
  const show = () => {
    const element = popoverRef.current;
    if (element && !element.matches(":popover-open")) element.showPopover();
  };
  const hide = () => {
    const element = popoverRef.current;
    if (element && element.matches(":popover-open")) element.hidePopover();
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-describedby={tooltipId}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(event) => {
          if (event.key === "Escape") hide();
        }}
        style={{ anchorName }}
        className="cursor-default rounded outline-none focus-visible:ring-ring/50 focus-visible:ring-3"
      >
        <time
          dateTime={dateTimeAttribute(at)}
          className="text-base text-muted-text underline decoration-dotted decoration-3 decoration-muted-text/50 underline-offset-4"
        >
          {relativeDate(at)}
        </time>
      </button>
      <div
        ref={popoverRef}
        id={tooltipId}
        role="tooltip"
        popover="manual"
        style={{
          positionAnchor: anchorName,
          position: "fixed",
          inset: "auto",
          margin: 0,
          left: "anchor(center)",
          top: "calc(anchor(bottom) + 0.5rem)",
          translate: "-50% 0",
        }}
        className="tooltip-pop rounded-md bg-background px-2 py-1 text-sm text-text whitespace-nowrap shadow-md"
      >
        {exact}
      </div>
    </span>
  );
}

// A collapsible log of recent IP/AS changes. Informational only: timestamps are
// approximate (they're when the server sampled the change, not when it happened).
// Hidden until there's more than the baseline entry, since a lone entry is just
// the current identity already shown in the status card.
// `open` is controlled by a stable ancestor (Dashboard) rather than the native
// <details> state, because this lives inside MamResponse, which the dashboard
// remounts on every update — local open/closed state wouldn't survive that.
export function IpHistory({
  history,
  open,
  onOpenChange,
}: Readonly<{
  history?: SerializedNetworkChange[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  if (!history || history.length <= 1) return;

  const entries = history.toReversed(); // newest first

  return (
    <details
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="details-reveal group w-full"
    >
      <summary className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-muted-text transition-colors outline-none list-none hover:text-text focus-visible:ring-ring/50 focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
        <span className="font-bold">IP history</span>
        <ChevronDown
          className="size-6 transition-transform duration-300 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      {/* The grid item that ::details-content collapses: must be min-h-0 +
          overflow-hidden so the 0fr row can clip it. pl-4 indents the rows. */}
      <div className="min-h-0 overflow-hidden pl-4">
        <ul className="space-y-3 pt-2">
          {entries.map((entry) => {
            const at = Temporal.ZonedDateTime.from(entry.at);
            return (
              <li key={entry.at} className="space-y-0.5 text-left">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono font-bold">{entry.ip}</span>
                  <RelativeTime at={at} />
                </div>
                <div className="text-sm text-muted-text">
                  <span className="font-mono">{entry.asn}</span>, {entry.as}
                </div>
              </li>
            );
          })}
        </ul>
        <footer className="pt-3 text-xs text-muted-text text-balance">
          Times reflect when Mousehole noticed each change, not exactly when it
          happened. Only the most recent changes are kept.
        </footer>
      </div>
    </details>
  );
}
