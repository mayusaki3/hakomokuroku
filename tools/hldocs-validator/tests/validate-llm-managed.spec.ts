import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateLLMManaged } from "../src/validators/validate-llm-managed";

async function loadFixture(name: string) {
  const fixturePath = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    name,
  );

  return {
    path: fixturePath,
    content: await readFile(fixturePath, "utf-8"),
  };
}

describe("validateLLMManaged", () => {
  it("TC-01 valid -> no FAIL", async () => {
    const file = await loadFixture("valid.md");

    const issues = validateLLMManaged([file]);

    expect(issues.filter((x) => x.level === "FAIL")).toHaveLength(0);
  });

  it("TC-02 missing field -> FAIL", async () => {
    const file = await loadFixture("missing-field.md");

    const issues = validateLLMManaged([file]);

    expect(
      issues.some((x) => x.level === "FAIL"),
    ).toBe(true);
  });
});
