import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AttendancePanel } from "./attendance-panel";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/academy-api", () => ({ api }));
const students = [{ id: "s1", name: "Lan" }];
beforeEach(() => { api.mockReset(); api.mockResolvedValue([]); });

it("keeps unmarked students explicit and saves the selected status and note", async () => {
  render(<AttendancePanel classId="c1" students={students} onError={vi.fn()} />);
  const select = await screen.findByLabelText("Điểm danh Lan");
  expect(select).toHaveValue("");
  expect(screen.getByRole("button", { name: "Lưu điểm danh Lan" })).toBeDisabled();
  fireEvent.change(select, { target: { value: "late" } });
  fireEvent.change(screen.getByLabelText("Ghi chú Lan"), { target: { value: "Muộn 10 phút" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu điểm danh Lan" }));
  expect(await screen.findByText("Đã lưu điểm danh Lan.")).toBeInTheDocument();
  expect(api).toHaveBeenLastCalledWith("/classes/c1/students/s1/attendance", "PUT", { day: (screen.getByLabelText("Ngày điểm danh") as HTMLInputElement).value, status: "late", note: "Muộn 10 phút" });
});

it("loads saved values and ignores an outdated date response", async () => {
  let resolveOld!: (value: unknown) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  api.mockResolvedValue([{ user_id: "s1", status: "excused", note: "Có phép" }]);
  render(<AttendancePanel classId="c1" students={students} onError={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Ngày điểm danh"), { target: { value: "2026-10-29" } });
  expect(await screen.findByLabelText("Điểm danh Lan")).toHaveValue("excused");
  resolveOld([{ user_id: "s1", status: "absent", note: "Cũ" }]);
  await waitFor(() => expect(screen.getByLabelText("Ghi chú Lan")).toHaveValue("Có phép"));
});

it("reports a failed save without displaying success", async () => {
  const onError = vi.fn();
  api.mockImplementation(async (_path: string, method?: string) => { if (method === "PUT") throw new Error("save failed"); return []; });
  render(<AttendancePanel classId="c1" students={students} onError={onError} />);
  fireEvent.change(await screen.findByLabelText("Điểm danh Lan"), { target: { value: "present" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu điểm danh Lan" }));
  await waitFor(() => expect(onError).toHaveBeenCalledOnce());
  expect(screen.queryByText("Đã lưu điểm danh Lan.")).not.toBeInTheDocument();
});
