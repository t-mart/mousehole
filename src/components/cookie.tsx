import type { GetCookieResponse } from "src/lib/response";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function Cookie() {
  const { isPending, error, data } = useQuery({
    queryKey: ["cookie"],
    queryFn: () =>
      fetch("/cookie")
        .then((response) => response.json() as Promise<GetCookieResponse>)
        .then((data) => {
          if (!data.success) throw new TypeError("not success");
          return data.cookieValue;
        }),
  });

  useEffect(() => {
    if (data) {
      setCookie(data);
    }
  }, [data]);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      return fetch("/cookie", {
        method: "PUT",
        body: cookie,
      });
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["cookie"] });
    },
  });

  const [cookie, setCookie] = useState("");

  if (isPending) return "Loading...";

  if (error) return "An error has occurred: " + error.message;

  return (
    <form
      className="flex items-center gap-4 bg-[#1a1a1a] p-3 rounded-xl border-2 border-[#fbf0df] transition-colors w-full"
      onSubmit={(event) => event.preventDefault()}
    >
      <label htmlFor="cookie-input">Cookie</label>
      <input
        id="cookie-input"
        className="font-mono"
        type="text"
        value={cookie}
        onChange={(event) => setCookie(event.target.value)}
      />
      <button
        type="submit"
        className="button"
        onClick={() => mutation.mutate()}
      >
        Set
      </button>
    </form>
  );
}
