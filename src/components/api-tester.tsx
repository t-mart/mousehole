import { useRef, type FormEvent } from "react";

export function APITester() {
  const responseInputRef = useRef<HTMLTextAreaElement>(null);

  const testEndpoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const endpoint = formData.get("endpoint") as string;
      const url = new URL(endpoint, location.href);
      const method = formData.get("method") as string;
      const response = await fetch(url, { method });

      const data = await response.json();
      responseInputRef.current!.value = JSON.stringify(data, undefined, 2);
    } catch (error) {
      responseInputRef.current!.value = String(error);
    }
  };

  return (
    <div className="api-tester">
      <form onSubmit={testEndpoint} className="endpoint-row">
        <select name="method" className="method">
          <option value="GET">GET</option>
          <option value="PUT">PUT</option>
        </select>
        <input
          type="text"
          name="endpoint"
          defaultValue="/api/hello"
          className="url-input"
          placeholder="/api/hello"
        />
        <button type="submit" className="send-button">
          Send
        </button>
      </form>
      <textarea
        ref={responseInputRef}
        readOnly
        placeholder="Response will appear here..."
        className="response-area"
      />
    </div>
  );
}
