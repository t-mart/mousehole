import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useErrors } from "#frontend/lib/error-context.tsx";
import { docsBaseUrl } from "#shared/docs-base-url.ts";

import { Button } from "./lib/button";
import { Input } from "./lib/input";
import { Link } from "./lib/link";
import { Section } from "./lib/section";
import { Spinner } from "./lib/spinner";

export function CookieForm({
  onUpdated,
}: Readonly<{ onUpdated: () => void }>) {
  const [formCookie, setFormCookie] = useState("");
  const cookieInputId = useId();
  const { addError } = useErrors();

  const { mutate, isPending } = useMutation({
    mutationFn: async (cookie: string) => {
      const response = await fetch("/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentCookie: cookie }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        throw new Error(
          typeof body?.message === "string" ? body.message : "Failed to save cookie.",
        );
      }
    },
    onSuccess: () => {
      onUpdated();
    },
    onError: (error: Error) => addError(error.message),
  });

  function submitForm(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formCookie !== "") mutate(formCookie);
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
