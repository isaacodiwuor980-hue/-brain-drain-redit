import { describe, expect, it } from "vitest";
import { renderDataQualityPage } from "../data-quality-page";

describe("data quality report claims", () => {
  it("identifies design concepts and avoids unsupported universal guarantees", () => {
    const page = renderDataQualityPage({ origin: "https://example.org" });
    expect(page).toContain("design concepts, not verified platform-wide capabilities");
    expect(page).toContain("not available for every record");
    expect(page).not.toContain("Each is fully implemented and operational");
    expect(page).not.toContain("Every record has an explicit, per-record license choice");
    expect(page).not.toContain("world's most trusted source");
  });
});
