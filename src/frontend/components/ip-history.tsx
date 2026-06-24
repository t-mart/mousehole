import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { Temporal } from "temporal-polyfill";

import type { SerializedNetworkChange } from "#shared/public-state.ts";

import { cn } from "#frontend/lib/cn.ts";

import { layoutTransition } from "./lib/motion";
import { Section } from "./lib/section";

function formatAt(at: string): string {
  return Temporal.ZonedDateTime.from(at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// A collapsible log of recent IP/AS changes. Informational only: timestamps are
// approximate (they're when the server sampled the change, not when it happened).
// Hidden until there's more than the baseline entry, since a lone entry is just
// the current identity already shown in the status card.
export function IpHistory({
  history,
}: Readonly<{ history?: SerializedNetworkChange[] }>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  console.log({ history });

  if (!history || history.length <= 1) return;

  const entries = history.toReversed(); // newest first

  return (
    <Section className="flex-col gap-2">
      <h2 className="sr-only">IP history</h2>
      {/* TODO: should this be a <details>/<summary> element? */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-2 cursor-pointer rounded-md text-muted-text hover:text-text transition-colors outline-none focus-visible:ring-ring/50 focus-visible:ring-3"
      >
        <span className="font-bold">IP history</span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={layoutTransition}
            className="w-full overflow-hidden"
          >
            <ul className="space-y-3 pt-2">
              {entries.map((entry) => (
                <li key={entry.at} className="space-y-0.5 text-left">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-mono font-bold">{entry.ip}</span>
                    <span className="text-sm text-muted-text">
                      {formatAt(entry.at)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-text">
                    <span className="font-mono">{entry.asn}</span>, {entry.as}
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
}
