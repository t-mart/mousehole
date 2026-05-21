import { useId, useState } from "react";

import { docsBaseUrl } from "#shared/docs-base-url.ts";

import { Button } from "./button";
import { Input } from "./input";
import { Link } from "./link";
import { Section } from "./section";
import { Spinner } from "./spinner";

export function Cookie({
  onUpdated,
  currentCookie,
}: Readonly<{ onUpdated: () => void; currentCookie?: string }>) {
  const [formCookie, setFormCookie] = useState<string>(currentCookie ?? "");
  const [isPending, setIsPending] = useState<boolean>(false);
  const cookieInputId = useId();

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formCookie === "") {
      return; // Prevent submitting empty cookie
    }
    setIsPending(true);
    fetch("/state", {
      method: "PUT",
      body: JSON.stringify({ currentCookie: formCookie }),
    }).then(() => {
      setIsPending(false);
      setFormCookie("");
      onUpdated();
    });
  }

  return (
    <Section className="space-y-2">
      <h2 className="sr-only">Cookie</h2>
      <form onSubmit={submitForm} className="flex items-center gap-4 w-full">
        <label htmlFor={cookieInputId}>Cookie</label>
        <Input
          type="text"
          id={cookieInputId}
          value={formCookie}
          onChange={(event) => setFormCookie(event.target.value)}
          placeholder="Enter cookie"
          className="font-mono"
          aria-invalid={formCookie === "" ? "true" : "false"}
          spellCheck="false"
          autoComplete="off"
          required
        />
        <Button type="submit" aria-invalid={isPending || formCookie === ""}>
          {isPending ? <Spinner /> : "Set"}
        </Button>
      </form>

      <Link
        href={`${docsBaseUrl}/getting-your-cookie.md`}
        target="_blank"
        className="text-sm text-muted-text text-center mx-auto"
      >
        What do I enter here?
      </Link>
    </Section>
  );
}
