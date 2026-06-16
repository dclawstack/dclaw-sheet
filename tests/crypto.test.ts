import { describe, it, expect } from "vitest";
import { encryptJson, decryptJson } from "@/lib/crypto";

describe("connector config encryption", () => {
  it("round-trips and produces ciphertext (no plaintext leak)", () => {
    const secret = { kind: "postgres", connectionString: "postgres://u:p@h/db", query: "select 1" };
    const blob = encryptJson(secret);
    expect(blob).not.toContain("connectionString");
    expect(blob).not.toContain("u:p@h");
    expect(decryptJson(blob)).toEqual(secret);
  });

  it("produces distinct ciphertexts for the same input (random IV)", () => {
    expect(encryptJson({ a: 1 })).not.toBe(encryptJson({ a: 1 }));
  });
});
