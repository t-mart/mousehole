import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useErrors } from "#frontend/lib/error-context.tsx";

import { stateQueryKey } from "../lib/state-query";
import { Button } from "./lib/button";
import { Input } from "./lib/input";
import { Section } from "./lib/section";
import { Spinner } from "./lib/spinner";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const passwordId = useId();
  const queryClient = useQueryClient();
  const { addError } = useErrors();

  const { mutate, isPending } = useMutation({
    mutationFn: async (value: string) => {
      const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(body?.message ?? "Incorrect password.");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: stateQueryKey });
    },
    onError: (error: Error) => addError(error.message),
  });

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== "") {
      mutate(password);
    }
  }

  return (
    <Section className="space-y-2">
      <h2 className="sr-only">Log in</h2>
      <form onSubmit={handleSubmit} className="flex items-center gap-4 w-full">
        <label htmlFor={passwordId}>Password</label>
        <Input
          type="password"
          id={passwordId}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter password"
          aria-invalid={password === "" ? "true" : "false"}
          autoComplete="current-password"
          required
        />
        <Button
          type="submit"
          aria-invalid={isPending || password === ""}
          className="whitespace-nowrap"
        >
          {isPending ? <Spinner /> : "Log in"}
        </Button>
      </form>
    </Section>
  );
}
