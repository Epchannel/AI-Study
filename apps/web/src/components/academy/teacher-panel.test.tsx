import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TeacherPanel } from "./teacher-panel";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/academy-api", () => ({ api, downloadMaterial: vi.fn(), downloadClassReport: vi.fn() }));
vi.mock("./academy-app", () => ({ SUBJECTS: ["Toán"], LEVELS: { foundation: "Căn bản", advanced: "Nâng cao" } }));
const room = { id: "class-1", name: "Toán 10", subject: "Toán", grade: "10", join_code: "ABC123" };
const docs = [
  { id: "doc-1", title: "Đại số", filename: "algebra.pdf", status: "published", data: { chapter: "Phương trình", lesson: "Bậc hai", level: "foundation", version: 2, segments: [] } },
  { id: "doc-2", title: "Hình học", filename: "geometry.docx", status: "draft", data: { chapter: "Vector", lesson: "Tọa độ", level: "advanced", version: 1, segments: [] } },
];
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path: string) => path === "/teacher/overview" ? { class_count: 1, student_count: 0, active_students: 0, materials: { total: 2, draft: 1, published: 1 }, assignments: { total: 0, pending_review: 0, due_soon: 0 }, recent: [] } : path.endsWith("/materials") ? docs : path.endsWith("/report") ? { students: [], assignments: [] } : { id: "asset-1" });
});

it("filters teacher material by topic, publication state and level", async () => {
  render(<TeacherPanel classes={[room]} onRefresh={vi.fn()} onError={vi.fn()} onAsset={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Toán 10/ }));
  await screen.findByText("Đại số");
  fireEvent.change(screen.getByLabelText("Tìm học liệu"), { target: { value: "Tọa độ" } });
  expect(screen.queryByText("Đại số")).not.toBeInTheDocument();
  expect(screen.getByText("Hình học")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Lọc trạng thái"), { target: { value: "published" } });
  expect(screen.getByText("Không có tài liệu phù hợp.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Tìm học liệu"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Lọc trình độ"), { target: { value: "foundation" } });
  expect(screen.getByText("Đại số")).toBeInTheDocument();
  expect(screen.queryByText("Hình học")).not.toBeInTheDocument();
});

it("creates a draft exercise tied to the selected material and opens it", async () => {
  const onAsset = vi.fn();
  render(<TeacherPanel classes={[room]} onRefresh={vi.fn()} onError={vi.fn()} onAsset={onAsset} />);
  fireEvent.click(screen.getByRole("button", { name: /Toán 10/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Tạo quiz từ Đại số" }));
  await waitFor(() => expect(onAsset).toHaveBeenCalledWith("asset-1"));
  expect(api).toHaveBeenCalledWith("/assets/generate", "POST", expect.objectContaining({ material_id: "doc-1", classroom_id: "class-1", topic: "Bậc hai", subject: "Toán", mode: "foundation", kind: "quiz" }));
});

it("filters assignment management by workflow status", async () => {
  api.mockImplementation(async (path: string) => path === "/teacher/overview" ? { class_count: 1, student_count: 2, active_students: 1, materials: { total: 0, draft: 0, published: 0 }, assignments: { total: 2, pending_review: 1, due_soon: 0 }, recent: [] } : path.endsWith("/materials") ? [] : path.endsWith("/report") ? { students: [], assignments: [{ id: "a1", title: "Quiz nháp", status: "draft", submitted: 0, student_count: 2, completion_rate: 0 }, { id: "a2", title: "Quiz đã giao", status: "published", submitted: 1, student_count: 2, completion_rate: 50 }] } : {});
  render(<TeacherPanel classes={[room]} onRefresh={vi.fn()} onError={vi.fn()} onAsset={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Toán 10/ }));
  expect(await screen.findByText("Quiz nháp")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Lọc bài giao"), { target: { value: "published" } });
  expect(screen.queryByText("Quiz nháp")).not.toBeInTheDocument();
  expect(screen.getByText("Quiz đã giao")).toBeInTheDocument();
  expect(screen.getByText("1/2 đã nộp · 50%")).toBeInTheDocument();
});

it("searches students while keeping class-only progress visible", async () => {
  api.mockImplementation(async (path: string) => path === "/teacher/overview" ? { class_count: 1, student_count: 2, active_students: 1, materials: { total: 0, draft: 0, published: 0 }, assignments: { total: 0, pending_review: 0, due_soon: 0 }, recent: [] } : path.endsWith("/materials") ? [] : path.endsWith("/report") ? { students: [{ id: "s1", name: "An", attempts: [{ id: "x", asset_id: "a", data: { score: 8, total: 10, title: "Quiz", subject: "Toán", results: [] } }], cards_reviewed: 2, average_score: 80, last_activity: "2026-11-01T00:00:00Z" }, { id: "s2", name: "Bình", attempts: [], cards_reviewed: 0 }], assignments: [] } : {});
  render(<TeacherPanel classes={[room]} onRefresh={vi.fn()} onError={vi.fn()} onAsset={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Toán 10/ }));
  expect(await screen.findByText("An")).toBeInTheDocument();
  expect(screen.getByText("80%")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Tìm học sinh"), { target: { value: "Bình" } });
  const progress = screen.getByRole("heading", { name: "Theo dõi lớp học" }).closest(".ac-card") as HTMLElement;
  expect(within(progress).queryByText("An")).not.toBeInTheDocument();
  expect(within(progress).getByText("Bình")).toBeInTheDocument();
});

it("offers a class-scoped CSV export", async () => {
  api.mockImplementation(async (path: string) => path === "/teacher/overview" ? { class_count: 1, student_count: 0, active_students: 0, materials: { total: 0, draft: 0, published: 0 }, assignments: { total: 0, pending_review: 0, due_soon: 0 }, recent: [] } : path.endsWith("/materials") ? [] : path.endsWith("/report") ? { students: [], assignments: [] } : {});
  render(<TeacherPanel classes={[room]} onRefresh={vi.fn()} onError={vi.fn()} onAsset={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Toán 10/ }));
  const button = await screen.findByRole("button", { name: "Xuất CSV" });
  expect(button).toBeInTheDocument();
});

it("shows recent submission activity in the teacher overview", async () => {
  api.mockImplementation(async (path: string) => path === "/teacher/overview" ? { class_count: 1, student_count: 1, active_students: 1, materials: { total: 0, draft: 0, published: 0 }, assignments: { total: 1, pending_review: 0, due_soon: 0 }, recent: [{ id: "attempt-1", student_id: "student-1", asset_id: "asset-1", score: 8, total: 10, created_at: "2026-11-03T00:00:00Z" }] } : path.endsWith("/materials") ? [] : path.endsWith("/report") ? { students: [], assignments: [] } : {});
  render(<TeacherPanel classes={[room]} onRefresh={vi.fn()} onError={vi.fn()} onAsset={vi.fn()} />);
  expect(await screen.findByText("Bài nộp gần đây")).toBeInTheDocument();
  expect(screen.getByText("8/10 · 80%")).toBeInTheDocument();
});
