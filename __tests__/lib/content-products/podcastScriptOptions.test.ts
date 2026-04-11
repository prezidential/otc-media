import { describe, expect, it } from "vitest";
import {
  buildPodcastStyleBlock,
  parsePodcastScriptRequestOptions,
} from "@/lib/content-products/podcastScriptOptions";

describe("parsePodcastScriptRequestOptions", () => {
  it("defaults delivery and energy", () => {
    expect(parsePodcastScriptRequestOptions({})).toEqual({
      delivery: "conversational",
      energy: "medium",
      customDirection: "",
    });
  });

  it("accepts valid enums and trims custom", () => {
    expect(
      parsePodcastScriptRequestOptions({
        podcastDelivery: "narrative",
        podcastEnergy: "high",
        customDirection: "  be brief  ",
      })
    ).toEqual({
      delivery: "narrative",
      energy: "high",
      customDirection: "be brief",
    });
  });

  it("rejects invalid enums", () => {
    expect(
      parsePodcastScriptRequestOptions({
        podcastDelivery: "invalid",
        podcastEnergy: "nope",
      })
    ).toEqual({
      delivery: "conversational",
      energy: "medium",
      customDirection: "",
    });
  });
});

describe("buildPodcastStyleBlock", () => {
  it("includes custom direction when set", () => {
    const b = buildPodcastStyleBlock({
      delivery: "conversational",
      energy: "relaxed",
      customDirection: "More jokes",
    });
    expect(b).toContain("More jokes");
    expect(b).toContain("Relaxed");
  });
});
