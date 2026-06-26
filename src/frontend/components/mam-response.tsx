import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ComponentPropsWithRef,
  type Ref,
  useEffect,
  useRef,
  useState,
} from "react";
import { Temporal } from "temporal-polyfill";

import { useDashedIdent } from "#frontend/hooks/dashed-ident.ts";
import { cn } from "#frontend/lib/cn.ts";
import {
  classify,
  type ContactStatus,
  type PublicState,
} from "#shared/public-state.ts";

import { IpHistory } from "./ip-history";
import { Button } from "./lib/button";
import { bounceProps } from "./lib/motion";
import { Section } from "./lib/section";
import { NextUpdate } from "./next-update";

function getHostInfo(state: PublicState) {
  const contact = state.lastMamContact;
  return contact?.reached
    ? { ip: contact.ip, asn: contact.asn, as: contact.as }
    : undefined;
}

export function MamResponse({
  state,
  ref,
  ipHistoryOpen,
  onIpHistoryOpenChange,
}: Readonly<{
  state: PublicState;
  ref?: Ref<HTMLElement>;
  ipHistoryOpen: boolean;
  onIpHistoryOpenChange: (open: boolean) => void;
}>) {
  const hostInfo = getHostInfo(state);

  // The countdown rides along only when the dashboard is in its running state
  // and we have both endpoints of the wait: the last contact (`at`) and the
  // scheduled next one. Outside that (cookie setup, first-ever contact) there's
  // nothing to count toward.
  const nextUpdate =
    state.nextContactAt && state.lastMamContact?.at
      ? {
          at: Temporal.ZonedDateTime.from(state.lastMamContact.at),
          nextContactAt: Temporal.ZonedDateTime.from(state.nextContactAt),
        }
      : undefined;

  return (
    <Section ref={ref} className="space-y-2">
      <h2 className="sr-only">Status</h2>
      <dl className="w-full space-y-2">
        <DescListGroup>
          <DescListKey>Status</DescListKey>
          <DescListValue>
            <StatusLine data={state} />
          </DescListValue>
        </DescListGroup>
        {hostInfo && (
          <>
            <DescListGroup>
              <DescListKey>Host IP</DescListKey>
              <DescListValue>
                <CopyableIP ip={hostInfo.ip} />
              </DescListValue>
            </DescListGroup>
            <DescListGroup>
              <DescListKey>Host AS</DescListKey>
              <DescListValue>
                <span className="font-mono">{hostInfo.asn}</span>, {hostInfo.as}
              </DescListValue>
            </DescListGroup>
          </>
        )}
        {nextUpdate && (
          <DescListGroup>
            <DescListKey>Next update</DescListKey>
            <DescListValue>
              <NextUpdate
                at={nextUpdate.at}
                nextContactAt={nextUpdate.nextContactAt}
              />
            </DescListValue>
          </DescListGroup>
        )}
      </dl>
      <IpHistory
        history={state.history}
        open={ipHistoryOpen}
        onOpenChange={onIpHistoryOpenChange}
      />
    </Section>
  );
}

function CopyableIP({ ip }: Readonly<{ ip: string }>) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const copyText = copied ? "Copied!" : "Copy IP address";

  const anchorName = useDashedIdent("copy-ip");

  // Each copy restarts the "Copied!" window. Clear any pending reset first, or
  // an earlier press's timer fires mid-spam and flips the label back too soon.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  function copy() {
    void navigator.clipboard.writeText(ip).then(() => {
      setCopied(true);
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  // Hand-rolled tooltip (no native popover): `open` drives the mount,
  // AnimatePresence runs the bounce, and CSS anchor positioning pins it to the
  // button. Show on hover/focus, hide on leave/blur/Escape. The tooltip is
  // aria-hidden (its text only echoes the button's label); the button's
  // aria-label names it, and a visually hidden live region announces "Copied!".
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{ip}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={copy}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        aria-label="Copy IP address"
        style={{ anchorName }}
        className={cn(copied && "text-success hover:text-success")}
      >
        <span className="grid place-items-center">
          <AnimatePresence initial={false}>
            <motion.span
              key={copied ? "check" : "copy"}
              {...bounceProps}
              className="col-start-1 row-start-1"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </Button>
      <span role="status" className="sr-only">
        {copied ? "Copied!" : ""}
      </span>
      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            key={copyText}
            aria-hidden
            {...bounceProps}
            style={{
              positionAnchor: anchorName,
              position: "absolute",

              // BUG: overflow is measured against the containing block, not the
              // viewport; so, with flip-inline, the fallback always engages. I
              // like the right-side toolip though, so we just omit fallback
              // behavior and accept that it may clip on small screens.
              //
              // positionTryFallbacks: "flip-inline",

              left: "calc(anchor(right) + 0.5rem)",
              top: "anchor(center)",
              translate: "0 -50%",
              transformOrigin: "left center",
            }}
            className="z-10 rounded-md bg-background px-2 py-1 text-sm font-normal whitespace-nowrap shadow-md"
          >
            {copyText}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function DescListGroup({ ...props }: Readonly<ComponentPropsWithRef<"div">>) {
  return <div className="flex gap-4 items-center" {...props} />;
}

function DescListKey({ ...props }: Readonly<ComponentPropsWithRef<"dt">>) {
  return <dt className="mr-auto" {...props} />;
}

function DescListValue({ ...props }: Readonly<ComponentPropsWithRef<"dd">>) {
  return <dd className="ml-auto font-bold text-right" {...props} />;
}

function mamMessage(
  contact: PublicState["lastMamContact"],
): string | undefined {
  return contact?.reached ? contact.ipUpdate?.msg : undefined;
}

type Tone = "ok" | "warn" | "error";

const toneClass: Record<Tone, string> = {
  ok: "text-success",
  warn: "text-warn",
  error: "text-destructive",
};

// How each contact status paints and reads. `fallback` is shown when MAM left
// no message of its own (mamMessage). Exhaustive over ContactStatus, so adding
// a status to `classify` is a compile error until it's handled here.
const contactStatusTone: Record<
  ContactStatus,
  { tone: Tone; fallback: string }
> = {
  ok: { tone: "ok", fallback: "OK" },
  throttled: { tone: "warn", fallback: "Throttled" },
  rejected: { tone: "error", fallback: "Cookie rejected" },
  unreachable: { tone: "error", fallback: "Couldn't reach MAM" },
  // "no-cookie"/"pending" here mean a pre-cookie lookup is still the latest
  // contact — the brief window after setting a cookie. Treat it as pending.
  "no-cookie": { tone: "warn", fallback: "No cookie" },
  pending: { tone: "warn", fallback: "Awaiting first update" },
};

function describeStatus(data: PublicState): { tone: Tone; text: string } {
  if (!data.hasCookie) return { tone: "warn", text: "No cookie set" };
  const contact = data.lastMamContact;
  const { tone, fallback } = contactStatusTone[classify(contact)];
  return { tone, text: mamMessage(contact) ?? fallback };
}

function StatusLine({ data }: Readonly<{ data: PublicState }>) {
  const { tone, text } = describeStatus(data);
  return (
    <div className="flex items-center gap-x-2">
      <span className={toneClass[tone]}>{text}</span>
      <svg className={cn("size-5 rounded-full shrink-0", toneClass[tone])}>
        <circle cx="50%" cy="50%" r="50%" fill="currentColor" />
      </svg>
    </div>
  );
}
