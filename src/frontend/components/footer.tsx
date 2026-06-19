import { motion } from "motion/react";

import { gitHash } from "#shared/git-hash.ts";

import { version } from "../../../package.json";
import { Link } from "./lib/link";

export function Footer() {
  return (
    // `layout` so the footer glides as content above it changes height (the page
    // stays vertically centered — see motion memory).
    <motion.footer layout className="@container space-y-2">
      <ol className="flex justify-center flex-col @xs:flex-row flex-wrap gap-x-8 gap-y-2">
        <li>
          <Link
            href="https://www.myanonamouse.net/f/t/84712/p/p1013257"
            target="_blank"
          >
            Forum Post
          </Link>
        </li>
        <li>
          <Link href="https://github.com/t-mart/mousehole" target="_blank">
            GitHub
          </Link>
        </li>
        <li>
          <Link
            href="https://github.com/t-mart/mousehole#support-the-project"
            target="_blank"
            variant="disco"
          >
            Support the Project
          </Link>
        </li>
      </ol>
      <div>
        Mousehole v{version} <GitHashSpan /> by{" "}
        <Link href="https://www.myanonamouse.net/u/252061" target="_blank">
          timtimtim
        </Link>
      </div>
    </motion.footer>
  );
}

function GitHashSpan() {
  if (!gitHash) return;

  return (
    <>
      {" "}
      <span className="font-mono">
        (<code>{gitHash}</code>)
      </span>
    </>
  );
}
