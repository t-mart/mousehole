import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import type { PublicState } from "#backend/serde.ts";

import { useErrors } from "#frontend/lib/error-context.tsx";
import { stateQueryKey } from "#frontend/lib/state-query.ts";
import { docsBaseUrl } from "#shared/docs-base-url.ts";

import { Button } from "./lib/button";
import { Input } from "./lib/input";
import { Link } from "./lib/link";
import { Section } from "./lib/section";
import { Spinner } from "./lib/spinner";

export function CookieForm({
  onUpdate,
  onCancel,
  showCancel = true,
}: Readonly<{ onUpdate: () => void; onCancel: () => void; showCancel?: boolean }>) {
  const [formCookie, setFormCookie] = useState("");
  const cookieInputId = useId();
  const { addError } = useErrors();
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    // PUT /cookie sets the credential and contacts MAM in one shot, returning the
    // resulting state — so the status (incl. a bad-cookie rejection) shows at once.
    mutationFn: async (cookie: string) => {
      const response = await fetch("/cookie", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: cookie }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(body?.message ?? "Failed to save cookie.");
      }
      return (await response.json()) as PublicState;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(stateQueryKey, data);
      onUpdate();
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
        {showCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
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
