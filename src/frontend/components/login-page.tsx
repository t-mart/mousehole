import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Button } from "./lib/button";
import { Input } from "./lib/input";
import { Section } from "./lib/section";
import { Spinner } from "./lib/spinner";

export function LoginPage({ onLogin }: Readonly<{ onLogin: () => void }>) {
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const passwordId = useId();

  const { mutate, isPending } = useMutation({
    mutationFn: async (value: string) => {
      const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        throw new Error(
          typeof body?.message === "string" ? body.message : "Incorrect password.",
        );
      }
    },
    onSuccess: onLogin,
    onError: (error: Error) => setErrorMessage(error.message),
  });

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== "") {
      setErrorMessage(undefined);
      mutate(password);
    }
  }

  return (
    <main className="space-y-4">
      <Section className="space-y-2">
        <h2 className="sr-only">Log in</h2>
        <form onSubmit={handleSubmit} className="flex items-center gap-4 w-full">
          <label htmlFor={passwordId}>Password</label>
          <Input
            type="password"
            id={passwordId}
            value={password}
            onChange={(event) => { setPassword(event.target.value); setErrorMessage(undefined); }}
            placeholder="Enter password"
            aria-invalid={errorMessage !== undefined || password === "" ? "true" : "false"}
            autoComplete="current-password"
            required
          />
          <Button type="submit" aria-invalid={isPending || password === ""} className="whitespace-nowrap">
            {isPending ? <Spinner /> : "Log in"}
          </Button>
        </form>
        {errorMessage !== undefined && (
          <p className="text-destructive text-sm">{errorMessage}</p>
        )}
      </Section>
    </main>
  );
}
