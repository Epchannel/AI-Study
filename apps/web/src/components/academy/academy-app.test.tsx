import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AcademyApp } from "./academy-app";

const { api, streamMessage } = vi.hoisted(() => ({ api: vi.fn(), streamMessage: vi.fn() }));
vi.mock("@/lib/academy-api", () => ({ api, streamMessage, session: () => ({ access_token: "test" }), saveSession: vi.fn(), clearSession: vi.fn(), downloadMaterial: vi.fn() }));
vi.mock("@/components/shared/markdown-renderer", () => ({ MarkdownRenderer: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock("./learning-panel", () => ({ LearningPanel: () => <p>Bài luyện tập</p> }));
vi.mock("./teacher-panel", () => ({ TeacherPanel: () => <p>Quản lý giảng viên</p> }));
vi.mock("./career-panel", () => ({ CareerPanel: () => <p>Bản định hướng</p> }));
vi.mock("./student-panels", () => ({ ProfilePanel: () => <p>Hồ sơ cá nhân</p>, SchedulePanel: () => <p>Lịch cá nhân</p>, ProgressPanel: () => <p>Tiến độ cá nhân</p> }));
const profile = { grade: "10", level: "foundation", goal: "Ôn tập", subjects: ["Toán"], availability: [] };
const history = { id: "old-thread", title: "Bài đã học", data: { subject: "Toán", mode: "foundation", classroom_id: "room-1", material_id: "doc-2", messages: [] } };
beforeEach(() => {
  api.mockReset(); streamMessage.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  api.mockImplementation(async (path: string, method: string, body: unknown) => {
    if (path === "/me") return { id: "student", name: "Học sinh", role: "student", profile };
    if (path === "/classes") return [{ id: "room-1", name: "Toán 10", subject: "Toán", grade: "10" }];
    if (path === "/progress") return { streak: { current: 0, longest: 0, days: [], today_completed: false }, attempts: [], mastery: {} };
    if (path === "/schedule") return [];
    if (path.endsWith("/materials")) return [1, 2].map(n => ({ id: `doc-${n}`, title: `Tài liệu ${n}`, status: "published", data: { version: n } }));
    if (path === "/threads/old-thread") return history;
    if (path === "/threads" && method === "POST") return { id: "new-thread", data: { ...(body as object), messages: [] } };
    if (path === "/threads") return [history];
    return {};
  });
  streamMessage.mockImplementation(async (_id, _message, _signal, onText) => { onText("Cùng học từ nguồn đã chọn."); });
});

it("sends the selected document when creating chat and restores its source from history", async () => {
  render(<AcademyApp />);
  await screen.findByLabelText("Nguồn học liệu");
  fireEvent.change(screen.getByLabelText("Nguồn học liệu"), { target: { value: "room-1" } });
  await screen.findByRole("option", { name: "Tài liệu 1 · v1" });
  fireEvent.change(screen.getByLabelText("Tài liệu trong chat"), { target: { value: "doc-1" } });
  fireEvent.change(screen.getByLabelText("Tin nhắn cho giáo viên AI"), { target: { value: "Giải thích bài này" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
  await screen.findByText("Cùng học từ nguồn đã chọn.");
  expect(api).toHaveBeenCalledWith("/threads", "POST", expect.objectContaining({ classroom_id: "room-1", material_id: "doc-1" }));
  await waitFor(() => expect(screen.getByLabelText("Nguồn học liệu")).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Bài đã học" }));
  await waitFor(() => expect(screen.getByLabelText("Tài liệu trong chat")).toHaveValue("doc-2"));
});

it("navigates the student learning pages without exposing teacher navigation", async () => {
  render(<AcademyApp />);
  await screen.findByLabelText("Nguồn học liệu");
  expect(screen.queryByRole("button", { name: "Góc giảng viên" })).not.toBeInTheDocument();
  for (const [label, content] of [["Quiz & Flashcard", "Bài luyện tập"], ["Lịch học của tôi", "Lịch cá nhân"], ["Tiến độ học tập", "Tiến độ cá nhân"], ["Khám phá hướng nghiệp", "Bản định hướng"]]) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByText(content)).toBeInTheDocument();
  }
});
