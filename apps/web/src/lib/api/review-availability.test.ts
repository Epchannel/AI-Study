import { beforeEach, describe, expect, it, vi } from "vitest";
import { ttlCache } from "@/lib/cache";
import { getReviewSession } from "./progress";
import { getLectorOrderedFlashcards } from "./practice";
import { getFeatureFlags } from "./features";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./client", () => ({ request }));

beforeEach(() => {
  request.mockReset();
  ttlCache.invalidate("api:features");
});

describe("optional semantic review", () => {
  it("skips disabled LECTOR endpoints and shares feature discovery across consumers", async () => {
    request.mockResolvedValue({ lector: false });
    const [session, cards] = await Promise.all([
      getReviewSession("course-1"),
      getLectorOrderedFlashcards("course-1"),
    ]);
    expect(session).toEqual({ course_id: "course-1", items: [], count: 0 });
    expect(cards).toEqual({ cards: [], count: 0, lector_concepts: 0 });
    expect(request.mock.calls).toEqual([["/features"]]);
    await getReviewSession("course-2");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("loads semantic review when enabled", async () => {
    request.mockResolvedValueOnce({ lector: true });
    request.mockResolvedValueOnce({ items: [{ concept_id: "concept-1" }], count: 1 });
    expect((await getReviewSession("course-1", 5)).count).toBe(1);
    expect(request).toHaveBeenLastCalledWith("/progress/courses/course-1/review-session?max_items=5");
    request.mockResolvedValueOnce({ cards: [{ id: "card-1" }], count: 1 });
    expect((await getLectorOrderedFlashcards("course-1")).count).toBe(1);
    expect(request).toHaveBeenLastCalledWith("/flashcards/lector-order/course-1");
  });

  it("allows retrying feature discovery after a failure", async () => {
    request.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(getFeatureFlags()).rejects.toThrow("Network unavailable");
    request.mockResolvedValueOnce({ lector: false });
    await expect(getFeatureFlags()).resolves.toEqual({ lector: false });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
