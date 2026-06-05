import { Check, Copy } from "lucide-react";
import { type ComponentPropsWithRef, useState } from "react";

import { classify, type PublicState } from "#backend/serde.ts";
import { cn } from "#frontend/lib/cn.ts";

import { Section } from "./lib/section";

export function MamResponse({ data }: Readonly<{ data: PublicState }>) {
  const inDemoMode = process.env.PUBLIC_DEMO_MODE === "true";
  const contact = data.lastMamContact;
  // The IP/AS rows show only when we actually reached MAM — there's no cached
  // value, and a stale IP wouldn't help a user whose network is down.
  const host = inDemoMode
    ? { ip: "123.123.123.123", asn: 12_345, as: "MegaCorp Networks" }
    : contact?.reached
      ? { ip: contact.ip, asn: contact.asn, as: contact.as }
      : undefined;

  return (
    <Section className="space-y-2">
      <h2 className="sr-only">Status</h2>
      <dl className="w-full space-y-2">
        <DLRow>
          <DT>Status</DT>
          <DD>
            <StatusContent data={data} />
          </DD>
        </DLRow>
        {host && (
          <>
            <DLRow>
              <DT>Host IP</DT>
              <DD>
                <CopyableIP ip={host.ip} />
              </DD>
            </DLRow>
            <DLRow>
              <DT>Host AS</DT>
              <DD>
                <span className="font-mono">{host.asn}</span>, {host.as}
              </DD>
            </DLRow>
          </>
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
    <span className="inline-flex items-center gap-1">
      <span className="font-mono">{ip}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied!" : "Copy IP address"}
        className={cn(
          "cursor-pointer focus-ring",
          copied
            ? "text-success"
            : "text-muted-text hover:text-primary-background-bright",
        )}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </span>
  );
}

function DLRow({ ...props }: Readonly<ComponentPropsWithRef<"div">>) {
  return <div className="flex gap-4 items-center" {...props} />;
}

function DT({ ...props }: Readonly<ComponentPropsWithRef<"dt">>) {
  return <dt className="mr-auto" {...props} />;
}

function DD({ ...props }: Readonly<ComponentPropsWithRef<"dd">>) {
  return <dd className="ml-auto font-bold text-right" {...props} />;
}

// MAM's `msg` when we reached it (display only, never branched on for logic).
function mamMessage(contact: PublicState["lastMamContact"]): string | undefined {
  return contact?.reached ? contact.ipUpdate?.msg : undefined;
}

function StatusContent({ data }: Readonly<{ data: PublicState }>) {
  if (!data.hasCookie) {
    return <StatusLine state="warn" text="No cookie set" />;
  }

  const contact = data.lastMamContact;
  switch (classify(contact)) {
    case "ok": {
      return <StatusLine state="ok" text={mamMessage(contact) ?? "OK"} />;
    }
    case "throttled": {
      return (
        <StatusLine state="warn" text={mamMessage(contact) ?? "Change pending"} />
      );
    }
    case "rejected": {
      return (
        <StatusLine state="error" text={mamMessage(contact) ?? "Session rejected"} />
      );
    }
    case "unreachable": {
      return <StatusLine state="error" text="Couldn't reach MAM" />;
    }
    // "no-cookie" here means a pre-cookie lookup is still the latest contact — a
    // brief window after setting a cookie. Treat it as pending.
    default: {
      return <StatusLine state="warn" text="Pending check" />;
    }
  }
}

type State = "ok" | "error" | "warn";

function StatusLine({ state, text }: Readonly<{ state: State; text: string }>) {
  const styleClass =
    state === "ok"
      ? "text-success"
      : state === "error"
        ? "text-destructive"
        : "text-warn";
  return (
    <div className="flex items-center gap-x-2">
      <span className={cn(styleClass)}>{text}</span>
      <svg className={cn("size-5 rounded-full shrink-0", styleClass)}>
        <circle cx="50%" cy="50%" r="50%" fill="currentColor" />
      </svg>
    </div>
  );
}
