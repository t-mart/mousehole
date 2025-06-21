import { JSONParseError } from "./error";

export async function parseJsonResponse(response: Response): Promise<unknown> {
  const content = await response.text();
  try {
    return JSON.parse(content);
  } catch (error) {
    throw JSONParseError.fromResponse(response, { cause: error as Error });
  }
}

export async function parseRequestJson(request: Request): Promise<unknown> {
  const content = await request.text();
  if (!content) {
    return undefined;
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw JSONParseError.fromRequest(request, {
      cause: error as Error,
    });
  }
}
