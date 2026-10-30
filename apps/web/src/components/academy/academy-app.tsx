"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  MessageCircle,
  GraduationCap,
  CalendarDays,
  Flame,
  Compass,
  ArrowUp,
  Plus,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  Library,
  UserRound,
  Square,
  ChevronRight,
  ChartNoAxesCombined,
  LoaderCircle,
  ImagePlus,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import {
  api,
  session,
  saveSession,
  clearSession,
  streamMessage,
  downloadMaterial,
  type AcademyUser,
  type Classroom,
  type Thread,
  type Message,
  type Source,
  type Level,
  type Progress,
  type Schedule,
} from "@/lib/academy-api";
import { LearningPanel } from "./learning-panel";
import { TeacherPanel } from "./teacher-panel";
import { SourcePicker } from "./source-picker";
import { CareerPanel } from "./career-panel";
import { ProfilePanel, SchedulePanel, ProgressPanel } from "./student-panels";
import { AcademyChatImages } from "./academy-chat-images";
import { AcademyPendingImages } from "./academy-pending-images";
import "./academy.css";

export const SUBJECTS = [
  "Toán",
  "Ngữ văn",
  "Tiếng Anh",
  "Vật lí",
  "Hóa học",
  "Sinh học",
  "Lịch sử",
  "Địa lí",
  "Tin học",
  "Giáo dục kinh tế và pháp luật",
  "Hướng nghiệp",
];
export const LEVELS = {
  foundation: "Căn bản",
  standard: "Tiêu chuẩn",
  advanced: "Nâng cao",
};
type Page =
  | "chat"
  | "practice"
  | "schedule"
  | "career"
  | "teacher"
  | "profile"
  | "progress";

export function AcademyApp() {
  const [user, setUser] = useState<AcademyUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("chat");
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [schedule, setSchedule] = useState<Schedule[]>([]);
  const [error, setError] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [subject, setSubject] = useState("Toán");
  const [level, setLevel] = useState<Level>("foundation");
  const [classId, setClassId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  const showError = useCallback(
    (e: unknown) =>
      setError(e instanceof Error ? e.message : "Chưa hoàn tất yêu cầu."),
    [],
  );
  const refresh = useCallback(async () => {
    const [c, t, p, s] = await Promise.all([
      api<Classroom[]>("/classes"),
      api<Thread[]>("/threads"),
      api<Progress>("/progress"),
      api<Schedule[]>("/schedule"),
    ]);
    setClasses(c);
    setThreads(t);
    setProgress(p);
    setSchedule(s);
  }, []);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (session()) {
      api<AcademyUser>("/me")
        .then((u) => {
          setUser(u);
          setLevel(u.profile.level);
          return refresh();
        })
        .catch((e) => {
          clearSession();
          showError(e);
        })
        .finally(() => setLoading(false));
    } else {
      Promise.resolve().then(() => setLoading(false));
    }
    return () => {
      abort.current?.abort();
    };
  }, [refresh, showError]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.data.messages]);

  function navigate(next: Page) {
    if (sending) abort.current?.abort();
    setPage(next);
    setSidebar(false);
    setError("");
  }
  async function openThread(t: Thread) {
    if (sending) return;
    try {
      const opened = await api<Thread>(`/threads/${t.id}`);
      setThread(opened);
      setSubject(opened.data.subject);
      setLevel(opened.data.mode);
      setClassId(opened.data.classroom_id || "");
      setMaterialId(opened.data.material_id || "");
      setPage(t.data.subject === "Hướng nghiệp" ? "career" : "chat");
      setSidebar(false);
    } catch (e) {
      showError(e);
    }
  }
  async function send(text = draft) {
    if ((!text.trim() && !images.length) || sending) return;
    const attachments = images;
    setError("");
    setSending(true);
    setDraft("");
    setImages([]);
    const controller = new AbortController();
    abort.current = controller;
    let current = thread;
    let savedMessages: Message[] = [];
    let answer = "";
    let sources: Source[] = [];
    let createdAsset: string | null = null;
    let committed = false;
    try {
      const chosenSubject = page === "career" ? "Hướng nghiệp" : subject;
      if (
        !current ||
        current.data.subject !== chosenSubject ||
        current.data.mode !== level ||
        (current.data.classroom_id || "") !== classId ||
        (current.data.material_id || "") !== materialId
      ) {
        current = await api<Thread>("/threads", "POST", {
          subject: chosenSubject,
          mode: level,
          classroom_id: classId || null,
          material_id: materialId || null,
        });
      }
      const active = current;
      savedMessages = active.data.messages || [];
      const render = () =>
        setThread({
          ...active,
          data: {
            ...active.data,
            messages: [
              ...savedMessages,
              { role: "user", content: text },
              {
                role: "assistant",
                content: answer,
                sources,
                asset_id: createdAsset,
              },
            ],
          },
        });
      render();
      try {
        await streamMessage(
          active.id,
          text,
          controller.signal,
          (chunk) => {
            answer += chunk;
            render();
          },
          (value) => {
            sources = value;
            render();
          },
          (action) => {
            if (action.type === "asset") {
              createdAsset = action.id;
              render();
            }
          },
          attachments,
        );
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) showError(e);
        else setError("Đã dừng trả lời. Câu trả lời dở dang chưa được lưu.");
        setThread({
          ...active,
          data: { ...active.data, messages: savedMessages },
        });
        setDraft(text);
        setImages(attachments);
        return;
      }
      committed = true;
      try {
        const saved = await api<Thread>(`/threads/${active.id}`);
        setThread(saved);
        await refresh();
      } catch {
        setError("Tin nhắn đã được gửi, nhưng chưa thể đồng bộ lại cuộc trò chuyện. Hãy tải lại sau.");
      }
    } catch (e) {
      showError(e);
      if (!committed) {
        if (current)
          setThread({
            ...current,
            data: { ...current.data, messages: savedMessages },
          });
        setDraft(text);
        setImages(attachments);
      }
    } finally {
      setSending(false);
      abort.current = null;
    }
  }

  if (loading)
    return (
      <div className="academy academy-loading">
        <LoaderCircle className="spin" />
        Đang mở góc học tập…
      </div>
    );
  if (!user)
    return (
      <AuthScreen
        error={error}
        onError={showError}
        onLogin={async (u) => {
          setUser(u);
          setLevel(u.profile.level);
          setError("");
          await refresh();
        }}
      />
    );

  const nav = [
    { id: "chat" as const, label: "Giáo viên AI", icon: MessageCircle },
    { id: "practice" as const, label: "Quiz & Flashcard", icon: BookOpen },
    { id: "schedule" as const, label: "Lịch học của tôi", icon: CalendarDays },
    { id: "career" as const, label: "Khám phá hướng nghiệp", icon: Compass },
    {
      id: "progress" as const,
      label: "Tiến độ học tập",
      icon: ChartNoAxesCombined,
    },
    ...(user.role === "teacher"
      ? [
          {
            id: "teacher" as const,
            label: "Góc giảng viên",
            icon: GraduationCap,
          },
        ]
      : []),
  ];
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const todaySessions = schedule.filter(
    (s) => s.data.start.slice(0, 10) === today,
  );
  const chatPage = page === "chat" || page === "career";
  return (
    <div className="academy">
      {sidebar && (
        <button
          className="academy-overlay"
          aria-label="Đóng menu"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`academy-sidebar ${sidebar ? "is-open" : ""}`}>
        <Link className="academy-brand" href="/">
          <span>
            <GraduationCap size={24} />
          </span>
          <div>
            học cùng<span>Học mỗi ngày. Lớn mỗi ngày.</span>
          </div>
        </Link>
        <button
          className="ac-button ac-primary academy-new"
          onClick={() => {
            navigate("chat");
            setThread(null);
          }}
        >
          <Plus size={17} />
          Cuộc trò chuyện mới
        </button>
        <div className="ac-eyebrow">GÓC HỌC TẬP</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`academy-nav ${page === n.id ? "active" : ""}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {page === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="ac-eyebrow history-title">TRÒ CHUYỆN GẦN ĐÂY</div>
        <div className="academy-history">
          {threads.slice(0, 15).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                void openThread(t);
              }}
              className={thread?.id === t.id ? "selected" : ""}
            >
              <MessageCircle size={14} />
              <span>{t.title}</span>
            </button>
          ))}
          {threads.length === 0 && <p>Mỗi câu hỏi là một khởi đầu.</p>}
        </div>
        <div className="academy-sidebar-bottom">
          <button onClick={() => navigate("profile")} className="academy-user">
            <span className="academy-avatar">{user.name[0]}</span>
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.role === "teacher"
                  ? "Giảng viên"
                  : `Học sinh · Lớp ${user.profile.grade}`}
              </small>
            </span>
            <UserRound size={17} />
          </button>
          <button
            className="ac-text-button"
            onClick={() => {
              abort.current?.abort();
              clearSession();
              setUser(null);
              setThread(null);
              setThreads([]);
              setClassId("");
              setMaterialId("");
            }}
          >
            <LogOut size={14} /> Đăng xuất
          </button>
        </div>
      </aside>

      <div className="academy-main">
        <header className="academy-header">
          <div>
            <button
              className="ac-icon-button mobile-menu"
              aria-label="Mở menu"
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? <PanelLeftClose size={21} /> : <PanelLeft size={21} />}
            </button>
            <span>
              {nav.find((n) => n.id === page)?.label || "Hồ sơ học tập"}
            </span>
          </div>
          <div className="academy-header-right">
            <span className="ac-status">
              <i />
              Không gian học tập của bạn
            </span>
            <button
              className="academy-streak"
              onClick={() => navigate("progress")}
            >
              <Flame size={18} />
              {progress?.streak.current || 0}
              <span>ngày liên tiếp</span>
            </button>
          </div>
        </header>
        {error && (
          <div role="alert" className="ac-error">
            {error}
            <button onClick={() => setError("")} aria-label="Đóng thông báo">
              ×
            </button>
          </div>
        )}
        <div className={`academy-body ${chatPage ? "with-aside" : ""}`}>
          <section className="academy-content">
            {chatPage && (
              <>
                <div className="academy-chat-toolbar">
                  <div>
                    <select
                      aria-label="Môn học"
                      value={page === "career" ? "Hướng nghiệp" : subject}
                      disabled={sending || page === "career"}
                      onChange={(e) => {
                        setSubject(e.target.value);
                        setThread(null);
                      }}
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Trình độ"
                      value={level}
                      disabled={sending}
                      onChange={(e) => {
                        setLevel(e.target.value as Level);
                        setThread(null);
                      }}
                    >
                      {Object.entries(LEVELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <SourcePicker
                    classes={classes}
                    classId={classId}
                    materialId={materialId}
                    disabled={sending}
                    onError={showError}
                    onChange={(classId, materialId) => {
                      setClassId(classId);
                      setMaterialId(materialId);
                      setThread(null);
                    }}
                  />
                </div>
                <div className="academy-chat-messages">
                  {page === "career" && (
                    <CareerPanel
                      key={user.id}
                      profile={user.profile}
                      onProfile={() => navigate("profile")}
                      onError={showError}
                    />
                  )}
                  {!thread?.data.messages?.length ? (
                    <div className="academy-welcome">
                      <div className="academy-welcome-icon">
                        <Sparkles size={30} />
                      </div>
                      <p className="ac-eyebrow">MỖI NGÀY MỘT CHÚT TIẾN BỘ</p>
                      <h1>
                        {page === "career" ? (
                          "Tương lai bắt đầu từ\nviệc hiểu chính mình."
                        ) : (
                          <>
                            Chào {user.name.split(" ").at(-1)},<br />
                            hôm nay mình học gì?
                          </>
                        )}
                      </h1>
                      <p>
                        {page === "career"
                          ? "Cùng khám phá điều bạn yêu thích, thế mạnh và những con đường phù hợp. Bạn có thể cập nhật sở thích trong Hồ sơ trước khi bắt đầu."
                          : "Một người thầy kiên nhẫn, một lộ trình riêng cho bạn.\nCứ hỏi, mình sẽ cùng tìm hiểu từ những điều căn bản nhất."}
                      </p>
                      <div className="academy-prompts">
                        {(page === "career"
                          ? [
                              "Hỏi em từng câu để khám phá sở thích và thế mạnh nghề nghiệp.",
                              "Giúp em so sánh ngành Công nghệ thông tin và Thiết kế.",
                              "Em chưa biết chọn ngành. Em nên bắt đầu từ đâu?",
                              "Lập lộ trình trải nghiệm nghề nghiệp cho học sinh lớp " +
                                user.profile.grade,
                            ]
                          : [
                              "Giải thích một bài " +
                                subject +
                                " từ căn bản, sau đó cho em tự làm.",
                              "Kiểm tra kiến thức nền của em trước khi học bài mới.",
                              "Hướng dẫn em giải bài tập theo từng bước.",
                              "Em muốn ôn thi. Giúp em tìm phần kiến thức còn yếu.",
                            ]
                        ).map((prompt, i) => (
                          <button
                            key={prompt}
                            disabled={sending}
                            onClick={() => void send(prompt)}
                          >
                            <span>{["01", "02", "03", "04"][i]}</span>
                            {prompt}
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    thread.data.messages.map((message, index) => (
                      <article
                        key={index}
                        className={`academy-message ${message.role}`}
                      >
                        <span className="academy-message-avatar">
                          {message.role === "assistant" ? (
                            <Sparkles size={17} />
                          ) : (
                            user.name[0]
                          )}
                        </span>
                        <div>
                          <strong>
                            {message.role === "assistant"
                              ? "Học Cùng · Giáo viên AI"
                              : user.name}
                          </strong>
                          <MarkdownRenderer
                            content={
                              message.content ||
                              (sending ? "Đang suy nghĩ…" : "")
                            }
                          />
                          {message.role === "user" && <AcademyChatImages threadId={thread.id} images={message.images} />}
                          {message.asset_id && (
                            <button
                              className="ac-button ac-primary"
                              onClick={() => {
                                setAssetId(message.asset_id!);
                                navigate("practice");
                              }}
                            >
                              <BookOpen size={15} />
                              Mở bài luyện vừa tạo
                            </button>
                          )}
                          {message.sources && message.sources.length > 0 && (
                            <div className="academy-sources">
                              <span>
                                <Library size={13} /> Học liệu tham khảo
                              </span>
                              {message.sources.map((source, i) => (
                                <button
                                  key={i}
                                  onClick={() =>
                                    void downloadMaterial(
                                      source.material_id,
                                      source.title,
                                    ).catch(showError)
                                  }
                                >
                                  [{source.number || i + 1}] {source.title} ·{" "}
                                  {source.label || `v${source.version}`}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                  <div ref={bottom} />
                </div>
                <div className="academy-composer-wrap">
                  <form
                    className="academy-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <AcademyPendingImages images={images} onRemove={(index) => setImages(images.filter((_, itemIndex) => itemIndex !== index))} />
                    <label className="ac-image-picker">
                      <ImagePlus size={16} />Thêm ảnh
                      <input
                        aria-label="Đính kèm ảnh"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        hidden
                        disabled={sending}
                        onChange={(e) => {
                          const next = [...images, ...Array.from(e.target.files || [])];
                          const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
                          if (next.length > 3 || next.some((file) => !allowed.has(file.type) || file.size > 4 * 1024 * 1024) || next.reduce((total, file) => total + file.size, 0) > 8 * 1024 * 1024) {
                            showError("Tối đa 3 ảnh PNG, JPEG hoặc WebP; mỗi ảnh 4 MB, tổng 8 MB.");
                          } else {
                            setImages(next);
                          }
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <textarea
                      aria-label="Tin nhắn cho giáo viên AI"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={
                        page === "career"
                          ? "Kể mình nghe về điều bạn thích…"
                          : "Bạn đang muốn tìm hiểu điều gì?"
                      }
                      maxLength={8000}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (!sending) void send();
                        }
                      }}
                    />
                    <div>
                      <span>
                        <Sparkles size={13} /> Học theo nhịp của bạn
                      </span>
                      {sending ? (
                        <button
                          type="button"
                          className="ac-send"
                          aria-label="Dừng trả lời"
                          onClick={() => abort.current?.abort()}
                        >
                          <Square size={17} />
                        </button>
                      ) : (
                        <button
                          className="ac-send"
                          disabled={!draft.trim() && !images.length}
                          aria-label="Gửi tin nhắn"
                        >
                          <ArrowUp size={20} />
                        </button>
                      )}
                    </div>
                    <p className="ac-image-privacy">Ảnh đính kèm sẽ được gửi tới AI để hỗ trợ trả lời.</p>
                  </form>
                  <p>
                    AI có thể nhầm lẫn. Hãy đối chiếu kiến thức quan trọng với
                    học liệu và giảng viên.
                  </p>
                </div>
              </>
            )}
            {page === "practice" && (
              <LearningPanel
                user={user}
                classes={classes}
                onError={showError}
                onProgress={refresh}
                initialAssetId={assetId}
              />
            )}
            {page === "teacher" && user.role === "teacher" && (
              <TeacherPanel
                classes={classes}
                onRefresh={refresh}
                onError={showError}
                onAsset={(id) => {
                  setAssetId(id);
                  navigate("practice");
                }}
              />
            )}
            {page === "profile" && (
              <ProfilePanel
                user={user}
                onSave={(u) => {
                  setUser(u);
                  setLevel(u.profile.level);
                }}
                onError={showError}
              />
            )}
            {page === "schedule" && (
              <SchedulePanel
                user={user}
                entries={schedule}
                onRefresh={refresh}
                onError={showError}
              />
            )}
            {page === "progress" && (
              <ProgressPanel
                progress={progress}
                onPractice={() => navigate("practice")}
              />
            )}
          </section>
          {chatPage && (
            <aside className="academy-day">
              <div className="academy-day-heading">
                <span>HÀNH TRÌNH CỦA BẠN</span>
                <span>✦</span>
              </div>
              <div className="academy-day-date">
                <CalendarDays size={16} />
                {new Date().toLocaleDateString("vi-VN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
              </div>
              <div className="academy-streak-card">
                <div>
                  <Flame size={25} />
                  <strong>{progress?.streak.current || 0}</strong>
                  <span>ngày giữ nhịp học</span>
                </div>
                <p>
                  {progress?.streak.today_completed
                    ? "Bạn đã tiến thêm một bước hôm nay. Tuyệt lắm!"
                    : "Hoàn thành một quiz, ôn thẻ hoặc một buổi học để nối dài hành trình."}
                </p>
                <div className="academy-week">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - 6 + i);
                    const key = d.toLocaleDateString("en-CA", {
                      timeZone: "Asia/Ho_Chi_Minh",
                    });
                    return (
                      <span
                        key={i}
                        className={
                          progress?.streak.days.includes(key) ? "done" : ""
                        }
                      >
                        {["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()]}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="academy-aside-title">
                <h3>Hôm nay học gì?</h3>
                <button
                  onClick={() => navigate("schedule")}
                  aria-label="Mở lịch học"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              {todaySessions.length ? (
                todaySessions.slice(0, 4).map((s) => (
                  <button
                    key={s.id}
                    className="academy-day-session"
                    onClick={() => navigate("schedule")}
                  >
                    <span
                      className={
                        s.status === "completed" ? "session-complete" : ""
                      }
                    />
                    <div>
                      <strong>{s.data.subject}</strong>
                      <small>
                        {new Date(s.data.start).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {s.data.minutes} phút
                      </small>
                    </div>
                  </button>
                ))
              ) : (
                <div className="academy-empty-day">
                  <CalendarDays size={25} />
                  <p>
                    Một kế hoạch nhỏ,
                    <br />
                    một bước tiến lớn.
                  </p>
                  <button onClick={() => navigate("schedule")}>
                    Xây dựng lịch học <Plus size={14} />
                  </button>
                </div>
              )}
              <div className="academy-note">
                <span>GỬI BẠN MỘT ĐIỀU</span>
                <p>
                  “Không cần giỏi ngay từ đầu.
                  <br />
                  Chỉ cần bắt đầu để giỏi hơn.”
                </p>
                <BookOpen size={21} />
              </div>
              <button
                className="ac-text-button"
                onClick={() => navigate("profile")}
              >
                <UserRound size={14} /> Cá nhân hóa lộ trình của bạn
              </button>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthScreen({
  onLogin,
  error,
  onError,
}: {
  onLogin: (u: AcademyUser) => Promise<void>;
  error: string;
  onError: (e: unknown) => void;
}) {
  const [register, setRegister] = useState(false);
  const [first, setFirst] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ needs_teacher: boolean }>("/bootstrap")
      .then((b) => {
        setFirst(b.needs_teacher);
        setRegister(b.needs_teacher);
      })
      .catch(onError);
  }, [onError]);
  return (
    <div className="academy academy-auth">
      <div className="academy-auth-story">
        <div className="academy-brand">
          <span>
            <GraduationCap size={28} />
          </span>
          <div>
            học cùng<span>Một hành trình. Vô vàn khả năng.</span>
          </div>
        </div>
        <div>
          <p className="ac-eyebrow">KHÔNG CHỈ LÀ MỘT CÂU TRẢ LỜI</p>
          <h1>
            Hiểu bài hôm nay.
            <br />
            Vững bước
            <br />
            <em>ngày mai.</em>
          </h1>
          <p>
            Giáo viên AI, học liệu từ thầy cô và một lộ trình vừa sức.
            <br />
            Cùng bạn học từ căn bản, khám phá điều mình có thể.
          </p>
        </div>
        <span>Học tập · Luyện tập · Định hướng tương lai</span>
      </div>
      <div className="academy-auth-form">
        <GraduationCap size={34} />
        <h2>
          {first
            ? "Khởi tạo không gian giảng dạy"
            : register
              ? "Bắt đầu hành trình của bạn"
              : "Chào mừng bạn trở lại"}
        </h2>
        <p>
          {first
            ? "Tài khoản đầu tiên là giảng viên quản lý lớp. Các tài khoản đăng ký sau là học sinh."
            : "Mỗi ngày một chút, bạn sẽ đi được rất xa."}
        </p>
        {error && (
          <div role="alert" className="ac-error">
            {error}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              const result = await api<{
                user: AcademyUser;
                access_token: string;
                refresh_token: string;
              }>(
                register ? "/register" : "/login",
                "POST",
                Object.fromEntries(f),
              );
              saveSession(result);
              await onLogin(result.user);
            } catch (e) {
              onError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <label>
              Họ và tên
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                placeholder="Bạn muốn được gọi là gì?"
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="ban@example.com"
            />
          </label>
          <label>
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={8}
              maxLength={64}
              placeholder="Ít nhất 8 ký tự"
            />
          </label>
          <button className="ac-button ac-primary" disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : null}
            {register ? "Tạo tài khoản" : "Vào góc học tập"}
            <ChevronRight size={17} />
          </button>
        </form>
        {!first && (
          <button
            className="ac-text-button"
            onClick={() => setRegister(!register)}
          >
            {register
              ? "Đã có tài khoản? Đăng nhập"
              : "Chưa có tài khoản? Đăng ký học sinh"}
          </button>
        )}
      </div>
    </div>
  );
}
