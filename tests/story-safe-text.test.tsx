/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StorySafeText } from "../feed/StorySafeText";
describe("story HTML safety", () => {
  it("shows scripts as text, not executable markup", () => {
    const html = renderToString(<StorySafeText text={'<script>alert(1)</script>'} />);
    const container = document.createElement("div"); container.innerHTML = html;
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("<script>alert(1)</script>");
  });
});
