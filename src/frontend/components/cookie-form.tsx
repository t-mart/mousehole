import { useId, useState, type Ref } from "react";

import { useCookie } from "#frontend/hooks/cookie.ts";
import { docsBaseUrl } from "#shared/docs-base-url.ts";

import { Button } from "./lib/button";
import { Input } from "./lib/input";
import { Link } from "./lib/link";
import { Section } from "./lib/section";

export function CookieForm({
  onSetSuccess,
  onCancel,
  showCancel = true,
  ref,
}: Readonly<{
  onSetSuccess: () => void;
  onCancel: () => void;
  showCancel?: boolean;
  ref?: Ref<HTMLElement>;
}>) {
  const [cookie, setCookie] = useState("");
  const cookieInputId = useId();
  const { mutate, isPending } = useCookie({ onSetSuccess });

  const isCookieValid = cookie !== "";

  function submitForm(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    mutate(cookie);
  }

  return (
    <Section ref={ref} className="space-y-2">
      <h2 className="sr-only">Cookie</h2>
      <form onSubmit={submitForm} className="flex items-center gap-4 w-full">
        <label htmlFor={cookieInputId}>Cookie</label>
        <Input
          type="text"
          id={cookieInputId}
          value={cookie}
          onChange={(event) => setCookie(event.target.value)}
          placeholder="Enter cookie"
          className="font-mono"
          aria-invalid={!isCookieValid}
          spellCheck="false"
          autoComplete="off"
          required
        />
        <Button type="submit" disabled={!isCookieValid} loading={isPending}>
          Set
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
