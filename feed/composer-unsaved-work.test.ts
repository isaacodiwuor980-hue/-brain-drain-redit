import { describe, expect, it } from "vitest";
import { hasComposerUnsavedWork } from "./composer-unsaved-work";

describe("composer unsaved work", () => {
  const empty={content:"",title:"",tags:[],details:"",media:[],noteAttachments:[],brainId:null,eventTitle:"",eventDate:"",eventTime:"",eventLocation:"",depositFields:{}};
  it("recognizes text, attachments, event details and typed deposits", () => {
    expect(hasComposerUnsavedWork(empty)).toBe(false);
    for (const partial of [{content:"text"},{media:["image"]},{noteAttachments:[{data:"x"}]},{brainId:"brain"},{eventDate:"2027-01-01"},{depositFields:{steps:"step"}},{pendingTag:"unfinished"},{communityId:"room"},{editPolicy:"public"}]) {
      expect(hasComposerUnsavedWork({...empty,...partial})).toBe(true);
    }
  });
});
