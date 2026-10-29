"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Layers, Sparkles, ChevronLeft, Check, RotateCcw, LoaderCircle, ClipboardCheck } from "lucide-react";
import { api, type AcademyUser, type Classroom, type Asset, type QuizItem, type FlashItem, type Attempt, type Material } from "@/lib/academy-api";
import { SUBJECTS, LEVELS } from "./academy-app";

export function LearningPanel({ user, classes, onError, onProgress, initialAssetId }: { user: AcademyUser; classes: Classroom[]; onError: (e: unknown) => void; onProgress: () => Promise<void>; initialAssetId?: string | null }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [active, setActive] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [kind, setKind] = useState("quiz");
  const [classId, setClassId] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const minDueDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const refresh = useCallback(async () => setAssets(await api<Asset[]>("/assets")), []);
  useEffect(() => { refresh().catch(onError); }, [refresh, onError]);
  useEffect(() => {
    if (!initialAssetId) return;
    let cancelled = false;
    api<Asset>(`/assets/${initialAssetId}`).then(asset => { if (!cancelled) { setActive(asset); setSubmissionId(crypto.randomUUID()); } }).catch(onError);
    return () => { cancelled = true; };
  }, [initialAssetId, onError]);
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    api<Material[]>(`/classes/${classId}/materials`).then(rows => { if (!cancelled) setMaterials(rows.filter(m => m.status !== "archived")); }).catch(onError);
    return () => { cancelled = true; };
  }, [classId, onError]);
  async function open(id: string) {
    try { setActive(await api<Asset>(`/assets/${id}`)); setAnswers({}); setAttempt(null); setCardIndex(0); setFlipped(false); setSubmissionId(crypto.randomUUID()); }
    catch (e) { onError(e); }
  }
  async function publish() {
    if (!active) return;
    setBusy(true);
    try { await api(`/assets/${active.id}`, "PUT", { title: active.title, items: active.data.items, status: active.status, due_date: active.data.due_date || null }); await refresh(); }
    catch (e) { onError(e); } finally { setBusy(false); }
  }
  const editable = active && active.user_id === user.id && user.role === "teacher";
  const quizItems = active?.data.items as QuizItem[] | undefined;
  const flashItems = active?.data.items as FlashItem[] | undefined;
  const card = flashItems?.[cardIndex];
  const state = active?.reviews?.[String(cardIndex)];
  const due = !state?.due || new Date(state.due) <= new Date();
  function editItem(index: number, patch: Partial<QuizItem & FlashItem>) {
    if (!active) return;
    setActive({ ...active, data: { ...active.data, items: active.data.items?.map((item, i) => i === index ? { ...item, ...patch } : item) } });
  }
  return <div className="ac-panel"><div className="ac-panel-heading"><p className="ac-eyebrow">HIỂU SÂU HƠN QUA MỖI LẦN LUYỆN</p><h1>Quiz & Flashcard</h1><p>Kiểm tra kiến thức, học từ lỗi sai và nhớ lâu hơn từng ngày.</p></div>
    {active ? <>
      <button className="ac-text-button" onClick={() => { setActive(null); void refresh(); }}><ChevronLeft size={16} /> Tất cả bài luyện</button>
      <div className="ac-card ac-asset-header"><div><span className="ac-badge">{active.kind === "quiz" ? "QUIZ" : "FLASHCARD"} · {active.status === "draft" ? "CHỜ DUYỆT" : active.status === "published" ? "ĐÃ XUẤT BẢN" : "LƯU TRỮ"}</span><h2>{active.title}</h2><p>{active.data.subject} · {LEVELS[active.data.mode]}{active.data.diagnostic ? " · Đánh giá đầu vào" : ""}</p></div>{editable && <span className="ac-muted">Kiểm tra và chỉnh sửa nội dung trước khi giao cho lớp.</span>}</div>
      {editable ? <div className="ac-card"><h3>Biên tập và duyệt bài</h3><label>Tên bài<input value={active.title} onChange={e => setActive({ ...active, title: e.target.value })} /></label><div className="ac-form-grid"><label>Trạng thái<select value={active.status} onChange={e => setActive({ ...active, status: e.target.value })}><option value="draft">Nháp · Chưa giao</option><option value="published">Xuất bản · Giao cho lớp</option><option value="archived">Lưu trữ</option></select></label><label>Hạn hoàn thành<input type="date" min={minDueDate} value={active.data.due_date || ""} onChange={e => setActive({ ...active, data: { ...active.data, due_date: e.target.value } })} /></label></div>{active.kind === "quiz" ? quizItems?.map((q, i) => <fieldset key={i} className="ac-question"><legend>Câu {i + 1}</legend><label>Nội dung<textarea value={q.question} onChange={e => editItem(i, { question: e.target.value })} /></label>{q.options.map((option, j) => <label key={j}>{String.fromCharCode(65 + j)}<input value={option} onChange={e => editItem(i, { options: q.options.map((o, k) => k === j ? e.target.value : o) })} /></label>)}<label>Đáp án đúng<select value={q.answer} onChange={e => editItem(i, { answer: Number(e.target.value) })}>{q.options.map((_, j) => <option key={j} value={j}>{String.fromCharCode(65 + j)}</option>)}</select></label><label>Giải thích<textarea value={q.explanation} onChange={e => editItem(i, { explanation: e.target.value })} /></label><label>Chủ đề<input value={q.topic} onChange={e => editItem(i, { topic: e.target.value })} /></label></fieldset>) : flashItems?.map((c, i) => <fieldset key={i} className="ac-question"><legend>Thẻ {i + 1}</legend><label>Mặt trước<textarea value={c.front} onChange={e => editItem(i, { front: e.target.value })} /></label><label>Mặt sau<textarea value={c.back} onChange={e => editItem(i, { back: e.target.value })} /></label></fieldset>)}<button className="ac-button ac-primary" disabled={busy} onClick={() => void publish()}><Check size={16} />{busy ? "Đang lưu…" : "Lưu nội dung và trạng thái"}</button></div>
      : active.kind === "quiz" ? <div className="ac-card">{attempt ? <><div className="ac-score"><ClipboardCheck size={30} /><strong>{attempt.data.score}/{attempt.data.total}</strong><p>{attempt.data.score === attempt.data.total ? "Bạn đã nắm rất tốt bài này!" : "Mỗi lỗi sai là một cơ hội hiểu bài sâu hơn."}</p></div>{attempt.data.results.map((q, i) => <div key={i} className={`ac-question ${q.correct ? "correct" : "incorrect"}`}><span className="ac-badge">{q.correct ? "ĐÚNG" : "CẦN ÔN LẠI"} · {q.topic}</span><h3>{i + 1}. {q.question}</h3><p>Bạn chọn: {q.options[q.selected]}</p><p><strong>Đáp án: {q.options[q.answer!]}</strong></p><p>{q.explanation}</p></div>)}<button className="ac-button" onClick={() => { setAttempt(null); setAnswers({}); setSubmissionId(crypto.randomUUID()); }}><RotateCcw size={16} />Làm lại</button></> : <>{quizItems?.map((q, i) => <fieldset key={i} className="ac-question"><legend>Câu {i + 1} / {quizItems.length} · {q.topic}</legend><h3>{q.question}</h3>{q.options.map((option, j) => <label key={j} className={`ac-option ${answers[i] === j ? "selected" : ""}`}><input type="radio" name={`answer-${i}`} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} /><span>{String.fromCharCode(65 + j)}</span>{option}</label>)}</fieldset>)}<button className="ac-button ac-primary" disabled={busy || Object.keys(answers).length !== quizItems?.length} onClick={async () => { setBusy(true); try { setAttempt(await api<Attempt>(`/assets/${active.id}/attempts`, "POST", { answers: quizItems?.map((_, i) => answers[i]), submission_id: submissionId })); await onProgress(); } catch (e) { onError(e); } finally { setBusy(false); } }}>{busy ? "Đang chấm bài…" : "Nộp bài và xem lời giải"}</button></>}</div>
      : <div className="ac-card"><p className="ac-muted">Thẻ {cardIndex + 1}/{flashItems?.length} · {card?.topic}</p><button className="ac-flashcard" onClick={() => setFlipped(!flipped)}><span className="ac-eyebrow">{flipped ? "LỜI GIẢI" : "THỬ NHỚ LẠI"}</span><h2>{flipped ? card?.back : card?.front}</h2><small>{flipped ? "Nhấn để xem câu hỏi" : "Nhấn để lật thẻ"}</small></button>{!due ? <p className="ac-success">Đã ôn. Lần tiếp theo: {new Date(state!.due!).toLocaleString("vi-VN")}</p> : flipped && <div className="ac-rating">{["Quên", "Khó", "Nhớ", "Dễ"].map((label, i) => <button key={label} className="ac-button" disabled={busy} onClick={async () => { setBusy(true); try { const reviewed = await api<{ due: string; reps: number }>(`/assets/${active.id}/cards/${cardIndex}/review`, "POST", { rating: i + 1 }); setActive({ ...active, reviews: { ...active.reviews, [cardIndex]: reviewed } }); await onProgress(); } catch (e) { onError(e); } finally { setBusy(false); } }}>{label}</button>)}</div>}<div className="ac-row ac-spread"><button className="ac-button" disabled={cardIndex === 0} onClick={() => { setCardIndex(cardIndex - 1); setFlipped(false); }}>Thẻ trước</button><button className="ac-button ac-primary" disabled={cardIndex + 1 === flashItems?.length} onClick={() => { setCardIndex(cardIndex + 1); setFlipped(false); }}>Thẻ tiếp</button></div><p className="ac-muted">Lịch ôn FSRS tự điều chỉnh theo mức độ bạn nhớ mỗi thẻ.</p></div>}
    </> : <>
      <form className="ac-card" onSubmit={async e => { e.preventDefault(); setGenerating(true); const f = new FormData(e.currentTarget); try { const result = await api<{ id: string }>("/assets/generate", "POST", { kind, topic: f.get("topic"), subject: f.get("subject"), mode: f.get("mode"), count: Number(f.get("count")), classroom_id: classId || null, material_id: f.get("material_id") || null, diagnostic: f.get("diagnostic") === "on", due_date: f.get("due_date") || null }); await refresh(); await open(result.id); } catch (e) { onError(e); } finally { setGenerating(false); } }}><div className="ac-row"><Sparkles size={21} /><h2>Tạo một bài luyện riêng</h2></div><div className="ac-form-grid"><label>Hình thức<select value={kind} onChange={e => setKind(e.target.value)}><option value="quiz">Quiz trắc nghiệm</option><option value="flashcards">Bộ flashcard</option></select></label><label>Môn học<select name="subject" defaultValue="Toán">{SUBJECTS.filter(s => s !== "Hướng nghiệp").map(s => <option key={s}>{s}</option>)}</select></label><label>Nguồn học liệu<select value={classId} onChange={e => { setClassId(e.target.value); setMaterials([]); }}><option value="">Kiến thức chung · Cá nhân</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Trình độ<select name="mode" defaultValue={user.profile.level}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>{classId && <label>Tài liệu<select name="material_id"><option value="">Tìm trong toàn bộ học liệu lớp</option>{materials.map(m => <option key={m.id} value={m.id}>{m.title} · v{m.data.version}</option>)}</select></label>}<label>Số câu / thẻ<input type="number" min={3} max={15} defaultValue={5} name="count" required /></label>{user.role === "teacher" && classId && <label>Hạn nộp<input type="date" name="due_date" min={minDueDate} /></label>}</div><label>Bạn muốn luyện gì?<textarea name="topic" required maxLength={1000} placeholder="Ví dụ: Phương trình bậc hai, từ vựng chủ đề nghề nghiệp…" /></label>{kind === "quiz" && <label className="ac-check"><input type="checkbox" name="diagnostic" />Đánh giá đầu vào · câu hỏi tăng dần độ khó</label>}<button className="ac-button ac-primary" disabled={generating}>{generating ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{generating ? "Giáo viên AI đang soạn bài…" : "Tạo bài luyện"}</button>{generating && <p className="ac-muted">Bài soạn có thể mất một vài phút. Bạn không cần gửi lại yêu cầu.</p>}</form>
      <div className="ac-section-title"><h2>Thư viện luyện tập</h2><span>{assets.length} bài</span></div><div className="ac-asset-grid">{assets.map(asset => <button key={asset.id} className="ac-card ac-asset-tile" onClick={() => void open(asset.id)}>{asset.kind === "quiz" ? <BookOpen size={24} /> : <Layers size={24} />}<span className="ac-badge">{asset.classroom_id ? "BÀI TỪ LỚP" : "CÁ NHÂN"} · {asset.status === "draft" ? "NHÁP" : asset.status === "archived" ? "LƯU TRỮ" : "SẴN SÀNG"}</span><h3>{asset.title}</h3><p>{asset.data.subject} · {asset.item_count} {asset.kind === "quiz" ? "câu" : "thẻ"}</p>{asset.data.due_date && <small>Hạn: {asset.data.due_date}</small>}</button>)}</div>{assets.length === 0 && <div className="ac-empty"><Layers size={30} /><h3>Thư viện đang chờ bạn</h3><p>Tạo bài đầu tiên hoặc tham gia lớp để nhận bài từ giảng viên.</p></div>}
    </>}
  </div>;
}
