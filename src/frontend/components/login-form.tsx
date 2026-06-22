import { useId, useState, type Ref } from "react";

import { useLogin } from "#frontend/hooks/login.ts";

import { Button } from "./lib/button";
import { Input } from "./lib/input";
import { Section } from "./lib/section";

export function LoginForm({ ref }: Readonly<{ ref?: Ref<HTMLElement> }>) {
  const [password, setPassword] = useState("");
  const passwordInputId = useId();
  const { mutate, isPending } = useLogin();

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== "") {
      mutate(password);
    }
  }

  const isPasswordValid = password !== "";

  return (
    <Section ref={ref} className="space-y-2">
      <h2 className="sr-only">Log in</h2>
      <form onSubmit={handleSubmit} className="flex items-center gap-4 w-full">
        <label htmlFor={passwordInputId}>Password</label>
        <Input
          type="password"
          id={passwordInputId}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter password"
          autoComplete="current-password"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          required
        />
        <Button
          type="submit"
          aria-invalid={!isPasswordValid}
          loading={isPending}
          className="whitespace-nowrap"
        >
          Log in
        </Button>
      </form>
    </Section>
  );
}
