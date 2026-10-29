import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SourcePicker } from "./source-picker";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/academy-api", () => ({ api }));
const classes = [{ id: "class-1", name: "Toán 10", subject: "Toán", grade: "10" }, { id: "class-2", name: "Văn 10", subject: "Ngữ văn", grade: "10" }];
beforeEach(() => { api.mockReset(); });

it("selects an exact document and clears it on class change", async () => {
  api.mockResolvedValue([{ id: "doc-1", title: "Đại số", status: "published", data: { version: 2 } }, { id: "old", title: "Bản cũ", status: "archived", data: { version: 1 } }]);
  const onChange = vi.fn();
  render(<SourcePicker classes={classes} classId="class-1" materialId="" disabled={false} onChange={onChange} onError={vi.fn()} />);
  await screen.findByRole("option", { name: "Đại số · v2" });
  expect(screen.queryByRole("option", { name: /Bản cũ/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Tài liệu trong chat"), { target: { value: "doc-1" } });
  expect(onChange).toHaveBeenLastCalledWith("class-1", "doc-1");
  fireEvent.change(screen.getByLabelText("Nguồn học liệu"), { target: { value: "class-2" } });
  expect(onChange).toHaveBeenLastCalledWith("class-2", "");
});

it("ignores an old class response after switching classes", async () => {
  let resolveOld!: (rows: unknown[]) => void;
  api.mockImplementation((path: string) => path.includes("class-1") ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve([{ id: "doc-2", title: "Văn học", status: "published", data: { version: 1 } }]));
  const props = { classes, materialId: "", disabled: false, onChange: vi.fn(), onError: vi.fn() };
  const view = render(<SourcePicker {...props} classId="class-1" />);
  view.rerender(<SourcePicker {...props} classId="class-2" />);
  await screen.findByRole("option", { name: "Văn học · v1" });
  resolveOld([{ id: "doc-1", title: "Nguồn cũ", status: "published", data: { version: 1 } }]);
  await waitFor(() => expect(screen.getByRole("option", { name: "Văn học · v1" })).toBeInTheDocument());
  expect(screen.queryByRole("option", { name: /Nguồn cũ/ })).not.toBeInTheDocument();
});
