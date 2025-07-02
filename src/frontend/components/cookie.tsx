import { useId, useState } from "react";

import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Input } from "./input";
import { ButtonLink, Link } from "./link";
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

      <Dialog>
        <DialogTrigger asChild>
          <ButtonLink className="text-sm text-muted-text text-center mx-auto">
            What do I enter here?
          </ButtonLink>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Getting Your Cookie Value</DialogTitle>
            <DialogDescription>
              When running this service for the first time (or if the cookie
              gets out of sync), you need to set the Mousehole's cookie
              manually. Follow these steps to get yours.
            </DialogDescription>
            <CookieTutorial />
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function CookieTutorial() {
  return (
    <div className="space-y-4 mt-4">
      <ol className="list-decimal list-outside ml-4 space-y-6">
        <li>
          Go to the{" "}
          <Link
            href="https://www.myanonamouse.net/preferences/index.php?view=security"
            target="_blank"
          >
            MAM Security Settings page
          </Link>
          .
        </li>
        <li className="space-y-4">
          <p>Make a session.</p>

          <p className="italic">
            (If you already have a session you want to use here, click "View ASN
            locked session cookie" and proceed to the next step.)
          </p>

          <p>In the "Create session" section, enter these values:</p>

          <img
            src="/images/mam-session-form.png"
            alt="MAM Session Form"
            className="w-full border-2 border-border"
          />

          <table className="border-collapse border border-border mt-4">
            <tbody className="*:border-border *:border *:*:border *:*:border-border *:*:p-2">
              <tr>
                <td>IP</td>
                <td>
                  The current IP address of your seedbox host.{" "}
                  <span className="italic">
                    (Mousehole displays this behind this modal!)
                  </span>
                </td>
              </tr>
              <tr>
                <td>IP vs ASN locked session</td>
                <td>
                  <span className="font-mono font-bold">ASN</span> This allows
                  your IP to change.
                </td>
              </tr>
              <tr>
                <td>Allow Session to set Dynamic Seedbox</td>
                <td>
                  <span className="font-mono font-bold">Yes</span> This allows
                  the service to update your IP through MAM's API.
                </td>
              </tr>
              <tr>
                <td>Session Label/note</td>
                <td>
                  Something that identifies the seedbox host, such as "My
                  Seedbox - Mousehole".
                </td>
              </tr>
            </tbody>
          </table>

          <p>
            Then press the <span className="font-bold">Submit Changes!</span>{" "}
            button
          </p>
        </li>
        <li className="space-y-4">
          <p>Copy the cookie value on the shown page.</p>

          <img
            src="/images/mam-cookie.png"
            alt="MAM cookie"
            className="w-full border-2 border-border"
          />
        </li>
        <li className="space-y-4">
          <p>
            Paste the cookie here into Mousehole and click the "Set" button.
          </p>

          <img
            src="/images/cookie-form.png"
            alt="Mousehole cookie form"
            className="w-full border-2 border-border"
          />
        </li>
        <li className="space-y-4">
          <p>Click the "Check Now" button.</p>

          <img
            src="/images/check-now-button.png"
            alt="Mousehole check now button"
            className="w-full border-2 border-border"
          />
        </li>
        <li>
          <p>
            Et voilà! You should now see an OK status, and Mousehole keep your
            IP updated with MAM automatically in the background. You don't need
            to do anything else! You can close the page.
          </p>
        </li>
      </ol>
    </div>
  );
}
