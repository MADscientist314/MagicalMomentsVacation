import { describe, expect, it } from "vitest";
import { findSensitive, luhnValid, maskContacts } from "../shared/guard";

describe("findSensitive", () => {
  it("flags a spaced Visa test number", () => {
    expect(findSensitive("Visa 4111 1111 1111 1111 exp 12/28")).toEqual(["card"]);
  });

  it("flags a dashed card number", () => {
    expect(findSensitive("card 4111-1111-1111-1111")).toEqual(["card"]);
  });

  it("flags a 15-digit Amex number", () => {
    expect(findSensitive("Amex 378282246310005")).toEqual(["card"]);
  });

  it("ignores a 16-digit run that fails the Luhn check", () => {
    expect(findSensitive("4111 1111 1111 1112")).toEqual([]);
  });

  it("lets travel confirmation and booking numbers through", () => {
    expect(findSensitive("Disney confirmation 12345678, RCI booking 1234567")).toEqual([]);
  });

  it("lets phone numbers and zip codes through", () => {
    expect(findSensitive("Call 555-123-4567 or (555) 123-4567, zip 32830-1000")).toEqual([]);
  });

  it("lets dates through", () => {
    expect(findSensitive("Trip 2026-12-14 to 2026-12-20")).toEqual([]);
  });

  it("flags an SSN", () => {
    expect(findSensitive("SSN 123-45-6789")).toEqual(["ssn"]);
  });

  it("flags a passport number next to the word passport", () => {
    expect(findSensitive("passport number: 567891234")).toEqual(["passport"]);
  });

  it("does not flag the word passport on its own", () => {
    expect(findSensitive("passport expires June 2027")).toEqual([]);
  });
});

describe("maskContacts", () => {
  it("masks emails and formatted phone numbers but keeps confirmation numbers", () => {
    const m = maskContacts("Mom: amy@example.com, cell (407) 555-0199 or +1 407 555 0100; conf 12345678");
    expect(m.text).toBe("Mom: [email], cell [phone] or [phone]; conf 12345678");
    expect(m.emails).toBe(1);
    expect(m.phones).toBe(2);
  });

  it("is idempotent", () => {
    const once = maskContacts("amy@example.com 407-555-0199").text;
    expect(maskContacts(once).text).toBe(once);
  });
});

describe("luhnValid", () => {
  it("accepts a valid number and rejects an off-by-one", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
  });
});

describe("findSensitive with travel wording", () => {
  it("does not flag the word passports next to a booking number", () => {
    expect(findSensitive("Don't forget your passports; booking 1234567")).toEqual([]);
  });

  it("still flags a passport number written right after the word passport", () => {
    expect(findSensitive("Passport # X12345678")).toEqual(["passport"]);
    expect(findSensitive("passport 567891234")).toEqual(["passport"]);
  });
});
