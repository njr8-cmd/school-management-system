export async function readSetupResponse(
  response: Response,
  fallbackMessage: string,
): Promise<unknown> {
  const body = await response.text();
  let data: unknown;

  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an invalid response."
        : `${fallbackMessage} (HTTP ${response.status}).`,
    );
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : fallbackMessage;
    throw new Error(message);
  }

  return data;
}

export function getSetupRequestError(
  error: unknown,
  fallbackMessage: string,
): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "The request timed out. Check the connection and try again. If it may have completed, check the saved records before retrying.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}
