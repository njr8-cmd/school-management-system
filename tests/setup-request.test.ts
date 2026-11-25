import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSetupRequestError,
  readSetupResponse,
} from "../src/lib/setup-request";

test("setup requests parse successful JSON responses", async () => {
  const result = await readSetupResponse(
    Response.json({ created: true }),
    "Save failed.",
  );

  assert.deepEqual(result, { created: true });
});

test("setup requests surface server-provided errors", async () => {
  await assert.rejects(
    readSetupResponse(
      Response.json({ error: "Database unavailable." }, { status: 500 }),
      "Save failed.",
    ),
    /Database unavailable/,
  );
});

test("setup requests report non-JSON server errors without hiding the status", async () => {
  await assert.rejects(
    readSetupResponse(
      new Response("Internal Server Error", { status: 504 }),
      "Save failed.",
    ),
    /Save failed\. \(HTTP 504\)/,
  );
});

test("setup requests reject malformed successful responses", async () => {
  await assert.rejects(
    readSetupResponse(new Response("not json"), "Save failed."),
    /server returned an invalid response/i,
  );
});

test("setup request timeout errors explain that the save may still finish", () => {
  const error = getSetupRequestError(
    new DOMException("Timed out", "TimeoutError"),
    "Save failed.",
  );

  assert.match(error, /timed out/i);
  assert.match(error, /check the saved records before retrying/i);
});
