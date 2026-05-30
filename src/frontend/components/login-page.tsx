import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Button } from "./lib/button";
import { Input } from "./lib/input";
import { Section } from "./lib/section";
import { Spinner } from "./lib/spinner";

export function LoginPage({ onLogin }: Readonly<{ onLogin: () => void }>) {
  const [password, setPassword] = useState("");
  const [invalid, setInvalid] = useState(false);
  const passwordId = useId();

  const { mutate, isPending } = useMutation({
    mutationFn: async (value: string) => {
      const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
      if (!response.ok) throw new Error("Invalid password");
    },
    onSuccess: onLogin,
    onError: () => setInvalid(true),
  });

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== "") {
      setInvalid(false);
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
            onChange={(event) => { setPassword(event.target.value); setInvalid(false); }}
            placeholder="Enter password"
            aria-invalid={invalid || password === "" ? "true" : "false"}
            autoComplete="current-password"
            required
          />
          <Button type="submit" aria-invalid={isPending || password === ""} className="whitespace-nowrap">
            {isPending ? <Spinner /> : "Log in"}
          </Button>
        </form>
        {invalid && (
          <p className="text-destructive text-sm">Incorrect password.</p>
        )}
      </Section>
    </main>
  );
}
