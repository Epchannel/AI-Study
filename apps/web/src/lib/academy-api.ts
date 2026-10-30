"use client";

export type Level = "foundation" | "standard" | "advanced";
export interface Availability {
  weekday: number;
  start: string;
  end: string;
}
export interface Profile {
  grade: string;
  level: Level;
  goal: string;
  subjects: string[];
  availability: Availability[];
  exam_date?: string | null;
  interests?: string;
  strengths?: string;
  career_constraints?: string;
}
export interface AcademyUser {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
  profile: Profile;
}
export interface Classroom {
  id: string;
  name: string;
  subject: string;
  grade: string;
  join_code?: string;
}
export interface Source {
  number?: number;
  material_id: string;
  title: string;
  label?: string;
  version?: number;
}
export interface Message {
  role: "user" | "assistant";
  content: string;
  images?: { id: string; name: string; media_type: string; size_bytes: number; width: number; height: number }[];
  sources?: Source[];
  asset_id?: string | null;
}
export interface Thread {
  id: string;
  title: string;
  data: {
    subject: string;
    mode: Level;
    classroom_id?: string | null;
    material_id?: string | null;
    messages?: Message[];
  };
}
export interface Segment {
  label: string;
  text: string;
}
export interface Material {
  id: string;
  classroom_id: string;
  title: string;
  filename: string;
  status: string;
  data: {
    segments: Segment[];
    chapter: string;
    lesson: string;
    level: Level;
    version: number;
    parent_id?: string;
  };
}
export interface QuizItem {
  question: string;
  options: string[];
  answer?: number;
  explanation?: string;
  topic: string;
  difficulty?: string;
}
export interface FlashItem {
  front: string;
  back: string;
  topic: string;
}
export interface CardState {
  due?: string;
  reps: number;
}
export interface Asset {
  id: string;
  title: string;
  kind: "quiz" | "flashcards";
  status: string;
  classroom_id?: string | null;
  user_id: string;
  item_count?: number;
  data: {
    items?: (QuizItem | FlashItem)[];
    subject: string;
    mode: Level;
    diagnostic?: boolean;
    due_date?: string | null;
    sources?: Source[];
  };
  reviews?: Record<string, CardState>;
}
export interface Attempt {
  id: string;
  asset_id: string;
  data: {
    title: string;
    score: number;
    total: number;
    subject: string;
    results: (QuizItem & { selected: number; correct: boolean })[];
  };
}
export interface Progress {
  streak: {
    current: number;
    longest: number;
    today_completed: boolean;
    days: string[];
  };
  attempts: Attempt[];
  completed_activities: number;
  mastery: Record<string, { correct: number; total: number }>;
}
export interface Schedule {
  id: string;
  status: string;
  data: {
    title: string;
    subject: string;
    start: string;
    end: string;
    goal: string;
    minutes: number;
  };
}
export interface Report {
  students: {
    id: string;
    name: string;
    attempts: Attempt[];
    cards_reviewed: number;
    last_activity?: string | null;
    average_score?: number | null;
  }[];
  assignments: {
    id: string;
    title: string;
    status: string;
    due_date?: string;
    due_state?: string;
    submitted?: number;
    student_count?: number;
    completion_rate?: number;
  }[];
}
export interface TeacherOverview {
  class_count: number;
  student_count: number;
  active_students: number;
  materials: { total: number; draft: number; published: number };
  assignments: { total: number; pending_review: number; due_soon: number };
  recent: {
    id: string;
    student_id: string;
    student_name?: string;
    asset_id: string;
    asset_title?: string;
    score: number;
    total: number;
    created_at: string;
  }[];
}
export interface AssetAnalytics {
  asset_id: string;
  title: string;
  attempt_count: number;
  student_count: number;
  questions: {
    index: number;
    question: string;
    topic: string;
    attempts: number;
    correct: number;
    accuracy?: number | null;
    wrong_options: Record<string, number>;
  }[];
}

const SESSION_KEY = "hoccung.session";
interface Session {
  access_token: string;
  refresh_token: string;
}
export function session(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
export function saveSession(value: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(value));
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

let refreshing: Promise<void> | undefined;
async function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      const current = session();
      if (!current) throw new Error("Vui lòng đăng nhập.");
      const response = await fetch("/api/academy/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
      if (!response.ok) {
        clearSession();
        throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
      }
      saveSession(await response.json());
    })().finally(() => {
      refreshing = undefined;
    });
  }
  return refreshing;
}

function headers(form = false): Headers {
  const h = new Headers();
  const token = session()?.access_token;
  if (token) h.set("Authorization", `Bearer ${token}`);
  if (!form) h.set("Content-Type", "application/json");
  const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  if (csrf) h.set("X-CSRF-Token", csrf[1]);
  return h;
}

async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  const detail = body.detail || body.message;
  if (Array.isArray(detail))
    return new Error(detail.map((d: { msg: string }) => d.msg).join("; "));
  const requestId = response.headers.get("X-Request-Id");
  return new Error(
    (typeof detail === "string"
      ? detail
      : `Yêu cầu chưa hoàn tất (${response.status}).`) +
      (requestId ? ` Mã yêu cầu: ${requestId}` : ""),
  );
}

export async function academyRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const isForm = init.body instanceof FormData;
  let response = await fetch(`/api/academy${path}`, {
    ...init,
    headers: headers(isForm),
  });
  // 401 is rejected before route execution, so refreshing authentication cannot duplicate a generation.
  if (
    response.status === 401 &&
    session() &&
    !["/login", "/register", "/refresh"].includes(path)
  ) {
    await refreshSession();
    response = await fetch(`/api/academy${path}`, {
      ...init,
      headers: headers(isForm),
    });
  }
  if (!response.ok) throw await responseError(response);
  return response;
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await academyRequest(path, {
    method,
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  return response.json();
}

export async function downloadMaterial(id: string, name: string) {
  const response = await academyRequest(`/materials/${id}/download`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadClassReport(
  id: string,
  name = "bao-cao-lop.csv",
) {
  const response = await academyRequest(`/classes/${id}/report.csv`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function streamMessage(
  threadId: string,
  message: string,
  signal: AbortSignal,
  onText: (text: string) => void,
  onSources: (sources: Source[]) => void,
  onAction?: (action: { type: string; id: string }) => void,
  images: File[] = [],
) {
  const body = images.length
    ? (() => {
        const form = new FormData();
        form.set("message", message);
        images.forEach((image) => form.append("images", image));
        return form;
      })()
    : JSON.stringify({ message });
  const response = await academyRequest(`/threads/${threadId}/chat`, {
    method: "POST",
    body,
    signal,
  });
  if (!response.body) throw new Error("Không nhận được phản hồi streaming.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer = (
        buffer + decoder.decode(chunk.value, { stream: !chunk.done })
      ).replace(/\r\n/g, "\n");
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const lines = event.split("\n");
        const type = lines
          .find((l) => l.startsWith("event:"))
          ?.slice(6)
          .trim();
        const data = lines
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const parsed = JSON.parse(data);
        if (type === "content") onText(parsed.text);
        if (type === "sources") onSources(parsed);
        if (type === "action") onAction?.(parsed);
        if (type === "error")
          throw new Error(
            parsed.message +
              (parsed.request_id ? ` Mã yêu cầu: ${parsed.request_id}` : ""),
          );
        if (type === "done") done = true;
      }
      if (chunk.done) break;
    }
    if (!done)
      throw new Error("Kết nối kết thúc trước khi hoàn tất câu trả lời.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
