import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import { docsBaseUrl } from "#shared/docs-base-url.ts";

import { stateQueryKey } from "../hooks/invalidate-on-state-update";
import { Button } from "./lib/button";
import { Input } from "./lib/input";
import { Link } from "./lib/link";
import { Section } from "./lib/section";
import { Spinner } from "./lib/spinner";

export function CookieForm({
  onUpdated,
  currentCookie,
}: Readonly<{ onUpdated: () => void; currentCookie?: string }>) {
  const queryClient = useQueryClient();
  const [formCookie, setFormCookie] = useState(currentCookie ?? "");
  const cookieInputId = useId();

  const { mutate, isPending } = useMutation({
    mutationFn: (cookie: string) =>
      fetch("/state", {
        method: "PUT",
        body: JSON.stringify({ currentCookie: cookie }),
      }),
    onSuccess: () => {
      onUpdated();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: stateQueryKey });
    },
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
