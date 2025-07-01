import type { GetStateResponseBody } from "#backend/types.ts";

import { Section } from "./section";

export function StateResponse({
  data,
}: Readonly<{ data: GetStateResponseBody }>) {
  return (
    <Section>
      <details className="w-full">
        <summary className="cursor-pointer hover:text-primary-2">
          Mousehole API Response
        </summary>
        <div className="text-left max-h-30 overflow-auto p-2 border-2 rounded-md mt-2 w-full">
          <pre className="">
            {JSON.stringify(data, undefined, 2)}
          </pre>
        </div>
      </details>
    </Section>
  );
}
