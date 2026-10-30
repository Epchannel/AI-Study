import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AcademyApp } from "./academy-app";

const { api, streamMessage, academyRequest } = vi.hoisted(() => ({ api: vi.fn(), streamMessage: vi.fn(), academyRequest: vi.fn() }));
vi.mock("@/lib/academy-api", () => ({ api, streamMessage, academyRequest, session: () => ({ access_token: "test" }), saveSession: vi.fn(), clearSession: vi.fn(), downloadMaterial: vi.fn() }));
vi.mock("@/components/shared/markdown-renderer", () => ({ MarkdownRenderer: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock("./learning-panel", () => ({ LearningPanel: () => <p>Bài luyện tập</p> }));
vi.mock("./teacher-panel", () => ({ TeacherPanel: () => <p>Quản lý giảng viên</p> }));
vi.mock("./career-panel", () => ({ CareerPanel: () => <p>Bản định hướng</p> }));
vi.mock("./student-panels", () => ({ ProfilePanel: () => <p>Hồ sơ cá nhân</p>, SchedulePanel: () => <p>Lịch cá nhân</p>, ProgressPanel: () => <p>Tiến độ cá nhân</p> }));
const profile = { grade: "10", level: "foundation", goal: "Ôn tập", subjects: ["Toán"], availability: [] };
const history = { id: "old-thread", title: "Bài đã học", data: { subject: "Toán", mode: "foundation", classroom_id: "room-1", material_id: "doc-2", messages: [] } };
beforeEach(() => {
  api.mockReset(); streamMessage.mockReset(); academyRequest.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  academyRequest.mockResolvedValue(new Response(new Blob(["image"])));
  api.mockImplementation(async (path: string, method: string, body: unknown) => {
    if (path === "/me") return { id: "student", name: "Học sinh", role: "student", profile };
    if (path === "/classes") return [{ id: "room-1", name: "Toán 10", subject: "Toán", grade: "10" }];
    if (path === "/progress") return { streak: { current: 0, longest: 0, days: [], today_completed: false }, attempts: [], mastery: {} };
    if (path === "/schedule") return [];
    if (path.endsWith("/materials")) return [1, 2].map(n => ({ id: `doc-${n}`, title: `Tài liệu ${n}`, status: "published", data: { version: n } }));
    if (path === "/threads/old-thread") return history;
    if (path === "/threads" && method === "POST") return { id: "new-thread", data: { ...(body as object), messages: [] } };
    if (path === "/threads/new-thread") return { id: "new-thread", data: { subject: "Toán", mode: "foundation", messages: [{ role: "user", content: "Giải thích bài này" }, { role: "assistant", content: "Cùng học từ nguồn đã chọn." }] } };
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

it("sends valid image-only chat as multipart input and keeps its draft after a failed send", async () => {
  streamMessage.mockRejectedValueOnce(new Error("Mạng không ổn định"));
  render(<AcademyApp />);
  await screen.findByLabelText("Nguồn học liệu");
  const image = new File(["image"], "bai-toan.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Đính kèm ảnh"), { target: { files: [image] } });
  fireEvent.change(screen.getByLabelText("Tin nhắn cho giáo viên AI"), { target: { value: "Giải bài này" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Tin nhắn cho giáo viên AI")).toHaveValue("Giải bài này");
  expect(screen.getByText("bai-toan.png")).toBeInTheDocument();

  streamMessage.mockImplementationOnce(async (_id, _message, _signal, onText) => { onText("Đã nhận ảnh"); });
  fireEvent.change(screen.getByLabelText("Tin nhắn cho giáo viên AI"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
  await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(2));
  expect(streamMessage.mock.calls[1][6]).toEqual([image]);
  expect(api).toHaveBeenCalledWith("/threads/new-thread");
});

it("shows persisted attachment previews immediately after a completed stream", async () => {
  render(<AcademyApp />);
  await screen.findByLabelText("Nguồn học liệu");
  const original = api.getMockImplementation()!;
  api.mockImplementation(async (path: string, method?: string, body?: unknown) => {
    if (path === "/threads/new-thread") return { id: "new-thread", data: { subject: "Toán", mode: "foundation", messages: [{ role: "user", content: "", images: [{ id: "persisted", name: "đã-lưu.png", media_type: "image/png", size_bytes: 1, width: 1, height: 1 }] }, { role: "assistant", content: "Đã lưu ảnh" }] } };
    return original(path, method, body);
  });
  const image = new File(["image"], "bai.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Đính kèm ảnh"), { target: { files: [image] } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
  expect(await screen.findByAltText("đã-lưu.png")).toBeInTheDocument();
  expect(academyRequest).toHaveBeenCalledWith("/threads/new-thread/images/persisted", expect.anything());
});

it("does not restore a completed send when post-send synchronization fails", async () => {
  render(<AcademyApp />);
  await screen.findByLabelText("Nguồn học liệu");
  const original = api.getMockImplementation()!;
  api.mockImplementation(async (path: string, method?: string, body?: unknown) => {
    if (path === "/threads/new-thread") throw new Error("sync unavailable");
    return original(path, method, body);
  });
  const image = new File(["image"], "sent.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Đính kèm ảnh"), { target: { files: [image] } });
  fireEvent.change(screen.getByLabelText("Tin nhắn cho giáo viên AI"), { target: { value: "Đã gửi" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
  await screen.findByText("Tin nhắn đã được gửi, nhưng chưa thể đồng bộ lại cuộc trò chuyện. Hãy tải lại sau.");
  expect(streamMessage).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Tin nhắn cho giáo viên AI")).toHaveValue("");
  expect(screen.queryByText("sent.png")).not.toBeInTheDocument();
});

it("keeps a draft and attachments when creating a new thread fails", async () => {
  render(<AcademyApp />);
  await screen.findByLabelText("Nguồn học liệu");
  const original = api.getMockImplementation()!;
  api.mockImplementation(async (path: string, method?: string, body?: unknown) => {
    if (path === "/threads" && method === "POST") throw new Error("thread unavailable");
    return original(path, method, body);
  });
  const image = new File(["image"], "retry.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Đính kèm ảnh"), { target: { files: [image] } });
  fireEvent.change(screen.getByLabelText("Tin nhắn cho giáo viên AI"), { target: { value: "Giữ lại" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
  await screen.findByText("thread unavailable");
  expect(streamMessage).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Tin nhắn cho giáo viên AI")).toHaveValue("Giữ lại");
  expect(screen.getByText("retry.png")).toBeInTheDocument();
});
