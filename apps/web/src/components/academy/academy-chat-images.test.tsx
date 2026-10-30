import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AcademyChatImages } from "./academy-chat-images";
import { AcademyPendingImages } from "./academy-pending-images";

const { academyRequest } = vi.hoisted(() => ({ academyRequest: vi.fn() }));
vi.mock("@/lib/academy-api", () => ({ academyRequest }));

afterEach(() => vi.restoreAllMocks());

it("previews removals and revokes pending object URLs", () => {
  const create = vi.fn(() => "blob:pending");
  const revoke = vi.fn();
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  const onRemove = vi.fn();
  const image = new File(["image"], "bai.png", { type: "image/png" });
  const view = render(<AcademyPendingImages images={[image]} onRemove={onRemove} />);
  fireEvent.click(screen.getByRole("button", { name: "Xóa bai.png" }));
  expect(onRemove).toHaveBeenCalledWith(0);
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:pending");
});

it("aborts stale history image loads so old blobs never flash", async () => {
  let resolveOld: (value: Response) => void;
  const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
  academyRequest.mockImplementation((path: string) => path.endsWith("/old") ? oldResponse : Promise.resolve(new Response(new Blob(["new"]))));
  const create = vi.fn().mockReturnValueOnce("blob:old").mockReturnValueOnce("blob:new");
  const revoke = vi.fn();
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  const view = render(<AcademyChatImages threadId="thread" images={[{ id: "old", name: "cũ", media_type: "image/png", size_bytes: 1, width: 1, height: 1 }]} />);
  await waitFor(() => expect(academyRequest).toHaveBeenCalledTimes(1));
  view.rerender(<AcademyChatImages threadId="thread" images={[{ id: "new", name: "mới", media_type: "image/png", size_bytes: 1, width: 1, height: 1 }]} />);
  resolveOld!(new Response(new Blob(["old"])));
  await screen.findByAltText("mới");
  expect(screen.queryByAltText("cũ")).not.toBeInTheDocument();
  expect(academyRequest.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  await waitFor(() => expect(revoke).toHaveBeenCalled());
});
