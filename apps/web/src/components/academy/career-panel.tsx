"use client";

import { useEffect, useState } from "react";
import { api, type Profile } from "@/lib/academy-api";

interface CareerReport {
  summary: string;
  created_at: string;
  profile_snapshot: Partial<Profile>;
  options: { field: string; reasons: string[]; subjects: string[]; preparation: string[]; experiment: string; tradeoffs: string }[];
  next_steps: { period: string; action: string; outcome: string }[];
  questions: string[];
  admissions_note: string;
  references: { title: string; url: string; purpose: string }[];
}

export function CareerPanel({ profile, onProfile, onError }: { profile: Profile; onProfile: () => void; onError: (e: unknown) => void }) {
  const [report, setReport] = useState<CareerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ report: CareerReport | null }>("/career/report").then(result => { if (active) setReport(result.report); }).catch(e => { if (active) onError(e); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onError]);
  const ready = [profile.interests, profile.strengths, profile.career_constraints].every(value => value?.trim());
  const stale = report && ((["grade", "goal", "interests", "strengths", "career_constraints"] as const).some(key => (report.profile_snapshot[key] || "") !== (profile[key] || "")) || JSON.stringify(report.profile_snapshot.subjects || []) !== JSON.stringify(profile.subjects));
  async function generate() {
    setBusy(true);
    try { setReport((await api<{ report: CareerReport }>("/career/report", "POST")).report); }
    catch (e) { onError(e); }
    finally { setBusy(false); }
  }
  return <details className="ac-career-report">
    <summary>Bản định hướng nghề nghiệp của tôi</summary>
    <p>So sánh nhiều lựa chọn dựa trên sở thích, thế mạnh và điều kiện của bạn. Bạn vẫn có thể trò chuyện với giáo viên AI bên dưới.</p>
    {!ready && <p>Hãy bổ sung sở thích, thế mạnh và điều kiện chọn nghề trong Hồ sơ.</p>}
    <div className="ac-career-actions"><button className="ac-button" onClick={onProfile}>Cập nhật hồ sơ</button><button className="ac-button ac-primary" disabled={!ready || loading || busy} onClick={() => void generate()}>{busy ? "Đang xây dựng bản định hướng…" : report ? "Tạo lại theo hồ sơ" : "Tạo bản định hướng"}</button></div>
    {loading && <p role="status">Đang tải bản định hướng…</p>}
    {report && <>
      <p>Lập ngày {new Date(report.created_at).toLocaleDateString("vi-VN")}</p>
      {stale && <p role="status">Hồ sơ đã thay đổi. Hãy tạo lại để cập nhật các gợi ý.</p>}
      <p>{report.summary}</p>
      <div className="ac-career-options">{report.options.map(option => <article key={option.field}>
        <h3>{option.field}</h3><h4>Vì sao nên khám phá</h4><ul>{option.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
        <p><strong>Môn cần chuẩn bị:</strong> {option.subjects.join(", ")}</p>
        <h4>Chuẩn bị từ hôm nay</h4><ul>{option.preparation.map((step, i) => <li key={i}>{step}</li>)}</ul>
        <p><strong>Trải nghiệm thử:</strong> {option.experiment}</p><p><strong>Cần cân nhắc:</strong> {option.tradeoffs}</p>
      </article>)}</div>
      <h3>Lộ trình trải nghiệm</h3><ol>{report.next_steps.map((step, i) => <li key={i}><strong>{step.period}:</strong> {step.action}<p>Kết quả quan sát: {step.outcome}</p></li>)}</ol>
      <h3>Câu hỏi tìm hiểu thêm</h3><ul>{report.questions.map((question, i) => <li key={i}>{question}</li>)}</ul>
      <p>{report.admissions_note}</p>{report.references.map(reference => <p key={reference.url}><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a> — {reference.purpose}</p>)}
    </>}
  </details>;
}
