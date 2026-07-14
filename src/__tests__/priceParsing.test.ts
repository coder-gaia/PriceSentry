import { describe, it, expect } from "vitest";
import { parsePriceToCents } from "../scrapers/genericCssScraper";

describe("parsePriceToCents", () => {
  it("parses Brazilian format with thousands dot and comma decimal", () => {
    expect(parsePriceToCents("R$ 1.234,56")).toBe(123_456);
  });

  it("parses Brazilian format without thousands separator", () => {
    expect(parsePriceToCents("R$ 99,90")).toBe(9_990);
  });

  it("parses US format with thousands comma and dot decimal", () => {
    expect(parsePriceToCents("$1,234.56")).toBe(123_456);
  });

  it("parses a plain integer price as whole currency units", () => {
    expect(parsePriceToCents("R$ 50")).toBe(5_000);
  });

  it("throws on unparseable input", () => {
    expect(() => parsePriceToCents("indisponível")).toThrow();
  });
});
