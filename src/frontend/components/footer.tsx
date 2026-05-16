import { gitHash } from "#shared/git-hash.ts";

import { version } from "../../../package.json";
import { Link } from "./link";

export function Footer() {
  return (
    <footer className="@container space-y-2">
      <ol className="flex justify-between flex-col @xs:flex-row flex-wrap gap-2">
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
            href="https://hub.docker.com/r/tmmrtn/mousehole"
            target="_blank"
          >
            Docker Hub
          </Link>
        </li>
      </ol>
      <div>
        Mousehole v{version} <GitHashSpan /> by{" "}
        <Link href="https://www.myanonamouse.net/u/252061" target="_blank">
          timtimtim
        </Link>
      </div>
    </footer>
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
