import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CareerPanel } from "./career-panel";
import type { Profile } from "@/lib/academy-api";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/academy-api", () => ({ api }));
const profile: Profile = { grade: "10", level: "foundation", goal: "Tìm ngành", subjects: ["Toán"], availability: [], interests: "Máy tính", strengths: "Tư duy", career_constraints: "Gần nhà" };
beforeEach(() => { api.mockReset(); });

it("requires interview data before generating a report", async () => {
  api.mockResolvedValue({ report: null });
  const onProfile = vi.fn();
  render(<CareerPanel profile={{ ...profile, interests: "" }} onProfile={onProfile} onError={vi.fn()} />);
  await screen.findByText(/Hãy bổ sung sở thích/);
  expect(screen.getByRole("button", { name: "Tạo bản định hướng", hidden: true })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cập nhật hồ sơ", hidden: true }));
  expect(onProfile).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith("/career/report");
});

it("shows persisted alternatives, dates and stale profile warning", async () => {
  api.mockResolvedValue({ report: {
    summary: "Hãy thử trước khi quyết định", created_at: "2026-10-30T00:00:00Z", profile_snapshot: { ...profile, interests: "Vẽ" },
    options: [{ field: "Kỹ thuật", reasons: ["Thích giải quyết vấn đề"], subjects: ["Toán"], preparation: ["Luyện tư duy"], experiment: "Làm dự án nhỏ", tradeoffs: "Cần kiên trì" }],
    next_steps: [{ period: "Tuần 1", action: "Thử dự án", outcome: "Ghi lại trải nghiệm" }], questions: ["Bạn thích gì?"],
    admissions_note: "Đối chiếu đề án tuyển sinh theo năm", references: [{ title: "Bộ GDĐT", url: "https://moet.gov.vn/", purpose: "Tra cứu văn bản" }],
  } });
  render(<CareerPanel profile={profile} onProfile={vi.fn()} onError={vi.fn()} />);
  expect(await screen.findByText("Kỹ thuật")).toBeInTheDocument();
  expect(screen.getByText(/Hồ sơ đã thay đổi/)).toBeInTheDocument();
  expect(screen.getByText(/30\/10\/2026/)).toBeInTheDocument();
  expect(screen.getByText("Bộ GDĐT")).toHaveAttribute("href", "https://moet.gov.vn/");
});
