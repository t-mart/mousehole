import { Link } from "./link";

export function Header() {
  return (
    <header className="space-y-2 w-full">
      <h1 className="font-bold text-5xl">Mousehole</h1>
      <p>
        Keep your{" "}
        <Link href="https://www.myanonamouse.net/" target="_blank">
          Myanonamouse
        </Link>{" "}
        seedbox IP updated.
      </p>
    </header>
  );
}
