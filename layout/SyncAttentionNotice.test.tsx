import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {SyncAttentionNotice} from "./SyncAttentionNotice";
describe("sync attention notice",()=>{
  it("explains unknown save status without offering automatic repost",()=>{
    const html=renderToStaticMarkup(<SyncAttentionNotice count={2}/>);
    expect(html).toContain('role="status"');expect(html).toContain("2 sync items need attention");
    expect(html).toContain("status may be unknown");expect(html).toContain("before reposting");expect(html).not.toContain("<button");
  });
  it("shows nothing when there is no attention needed",()=>{expect(renderToStaticMarkup(<SyncAttentionNotice count={0}/>)).toBe("");});
});
