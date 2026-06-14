import { motion } from "motion/react";

import { Link } from "./lib/link";

export function Header() {
  return (
    // `layout` so the header glides to its new position when content below it
    // changes height (the page stays vertically centered — see motion memory).
    <motion.header layout className="space-y-2 w-full">
      <h1 className="font-bold text-5xl">Mousehole</h1>
      <p>
        Keep your{" "}
        <Link href="https://www.myanonamouse.net/" target="_blank">
          Myanonamouse
        </Link>{" "}
        seedbox IP updated.
      </p>
    </motion.header>
  );
}
