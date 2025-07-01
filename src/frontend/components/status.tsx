import type { ComponentPropsWithRef } from "react";

import type { GetStateResponseBody } from "#backend/types.ts";

import { cn } from "#frontend/lib/cn.ts";

import { Section } from "./section";

export function Status({ data }: Readonly<{ data: GetStateResponseBody }>) {
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
        <DLRow>
          <DT>Host IP</DT>
          {/* <DD><span className="font-mono">{data.host.ip}</span></DD> */}
          <DD><span className="font-mono">123.123.123.123</span></DD>
        </DLRow>
        <DLRow>
          <DT>Host AS</DT>
          {/* <DD><span className="font-mono">{data.host.asn}</span>, {data.host.as}</DD> */}
          <DD><span className="font-mono">12345</span>, MegaCorp Networks</DD>
        </DLRow>
      </dl>
    </Section>
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

function StatusContent({ data }: Readonly<{ data: GetStateResponseBody }>) {
  if (!data.currentCookie) {
    return <StatusLine state="warn" text="No cookie set" />;
  } else if (data.lastMam) {
    const success = data.lastMam.response.body.Success;
    const state = success ? "ok" : "error";
    const text = success? "OK": data.lastMam.response.body.msg
    return (
      <StatusLine
        state={state}
        text={text}
      />
    );
  } else {
    return <StatusLine state="warn" text="Pending check" />;
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
