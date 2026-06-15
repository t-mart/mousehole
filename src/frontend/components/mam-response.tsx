import { Check, Copy } from "lucide-react";
import { type ComponentPropsWithRef, type Ref, useState } from "react";
import { Temporal } from "temporal-polyfill";

import { cn } from "#frontend/lib/cn.ts";
import {
  classify,
  type ContactStatus,
  type PublicState,
} from "#shared/public-state.ts";

import { Section } from "./lib/section";
import { NextUpdate } from "./next-update";

function getHostInfo(state: PublicState) {
  if (process.env.PUBLIC_DEMO_MODE === "true") {
    return { ip: "123.123.123.123", asn: 12_345, as: "MegaCorp Networks" };
  }
  const contact = state.lastMamContact;
  return contact?.reached
    ? { ip: contact.ip, asn: contact.asn, as: contact.as }
    : undefined;
}

export function MamResponse({
  state,
  ref,
}: Readonly<{
  state: PublicState;
  ref?: Ref<HTMLElement>;
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
    </Section>
  );
}

function CopyableIP({ ip }: Readonly<{ ip: string }>) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(ip).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{ip}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied!" : "Copy IP address"}
        className={cn(
          "cursor-pointer focus-ring",
          copied
            ? "text-success"
            : "text-muted-text hover:text-primary-background-dark",
        )}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
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
