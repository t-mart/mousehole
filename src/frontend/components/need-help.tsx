import { docsBaseUrl } from "#shared/docs-base-url.ts";

import { Link } from "./link";
import { Section } from "./section";

export function NeedHelp() {
  return (
    <Section className="flex-col">
      <h2 className="sr-only">Need Help?</h2>

      <p className="text-center w-full">
        Need help? Check the{" "}
        <Link href={`${docsBaseUrl}/errors.md`} target="_blank">
          error documentation
        </Link>
        .
      </p>
    </Section>
  );
}
