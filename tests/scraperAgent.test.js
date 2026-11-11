const test = require("node:test");
const assert = require("node:assert/strict");
const { createRequestOptions, isPublicAddress } = require("../helper/scraperAgent");

test("recognizes loopback and private addresses as non-public", () => {
  for (const address of ["127.0.0.1", "10.0.0.8", "192.168.1.2", "::1", "169.254.1.1"]) {
    assert.equal(isPublicAddress(address), false, `${address} must not be public`);
  }
  assert.equal(isPublicAddress("not-an-ip"), false);
});

test("rejects non-HTTP(S) and credential-bearing scrape URLs", async () => {
  await assert.rejects(createRequestOptions("file:///etc/passwd"), /HTTP\(S\)/);
  await assert.rejects(createRequestOptions("https://user:secret@example.com/"), /credential-free/);
});

test("rejects local addresses and non-standard ports", async () => {
  await assert.rejects(createRequestOptions("http://127.0.0.1/"), /Non-public/);
  await assert.rejects(createRequestOptions("https://example.com:8443/"), /Non-standard ports/);
});
