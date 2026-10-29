import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearningPanel } from "./learning-panel";
import type { AcademyUser } from "@/lib/academy-api";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/academy-api", () => ({ api }));
vi.mock("./academy-app", () => ({ SUBJECTS: ["Toán"], LEVELS: { foundation: "Căn bản" } }));
const user: AcademyUser = { id: "student-1", name: "Học sinh", email: "student@test.vn", role: "student", profile: { grade: "10", level: "foundation", subjects: ["Toán"], goal: "", availability: [] } };
const quiz = { id: "quiz-1", title: "Phép cộng", kind: "quiz", status: "published", user_id: "teacher", item_count: 1, data: { subject: "Toán", mode: "foundation", items: [{ question: "2+2?", options: ["1", "2", "3", "4"], topic: "Cộng" }] } };

beforeEach(() => { api.mockReset(); });
describe("student practice", () => {
  it("keeps submission disabled until answered and shows feedback after scoring", async () => {
    const onProgress = vi.fn().mockResolvedValue(undefined);
    api.mockImplementation(async (path: string) => path === "/assets" ? [quiz] : path.endsWith("/attempts") ? { data: { score: 1, total: 1, results: [{ ...quiz.data.items[0], answer: 3, selected: 3, correct: true, explanation: "Hai cộng hai bằng bốn." }] } } : quiz);
    render(<LearningPanel user={user} classes={[]} onError={vi.fn()} onProgress={onProgress} />);
    fireEvent.click(await screen.findByRole("button", { name: /Phép cộng/ }));
    const submit = await screen.findByRole("button", { name: "Nộp bài và xem lời giải" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getAllByRole("radio")[3]);
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByText("Hai cộng hai bằng bốn.")).toBeInTheDocument();
    await waitFor(() => expect(onProgress).toHaveBeenCalledOnce());
    expect(api.mock.calls.find(c => String(c[0]).endsWith("/attempts"))?.[2].answers).toEqual([3]);
  });
});
