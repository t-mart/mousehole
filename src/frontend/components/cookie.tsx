import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import { docsBaseUrl } from "#shared/docs-base-url.ts";

import { Button } from "./button";
import { Input } from "./input";
import { Link } from "./link";
import { Section } from "./section";
import { Spinner } from "./spinner";
import { stateQueryKey } from "./use-invalidate-on-state-update";

export function Cookie({
  onUpdated,
  currentCookie,
}: Readonly<{ onUpdated: () => void; currentCookie?: string }>) {
  const queryClient = useQueryClient();
  const [formCookie, setFormCookie] = useState(currentCookie ?? "");
  const cookieInputId = useId();

  useEffect(() => {
    console.log("Current cookie:", currentCookie);
  }, [currentCookie]);

  const { mutate, isPending } = useMutation({
    mutationFn: (cookie: string) =>
      fetch("/state", {
        method: "PUT",
        body: JSON.stringify({ currentCookie: cookie }),
      }),
    onSuccess: () => {
      console.log("Cookie updated successfully");
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
