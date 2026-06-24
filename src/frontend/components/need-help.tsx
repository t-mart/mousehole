import type { Ref } from "react";

import { docsUrl } from "#frontend/lib/repo-url.ts";

import { Link } from "./lib/link";
import { Section } from "./lib/section";

export function NeedHelp({ ref }: Readonly<{ ref?: Ref<HTMLElement> }>) {
  return (
    <Section ref={ref} className="flex-col">
      <h2 className="sr-only">Need Help?</h2>

      <p className="text-center w-full">
        Need help? Check the{" "}
        <Link href={docsUrl("mam-errors.md")} target="_blank">
          MAM error documentation
        </Link>
        .
      </p>
    </Section>
  );
}
