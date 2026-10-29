"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/academy-api";

type Entry = { user_id: string; status: "" | "present" | "absent" | "late" | "excused"; note: string };
type Student = { id: string; name: string };
const labels = { present: "Có mặt", absent: "Vắng", late: "Đi muộn", excused: "Có phép" };

export function AttendancePanel({ classId, students, onError }: { classId: string; students: Student[]; onError: (e: unknown) => void }) {
  const [day, setDay] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setNotice(""); setEntries({});
    api<Entry[]>(`/classes/${classId}/attendance?day=${day}`).then(rows => {
      if (!cancelled) setEntries(Object.fromEntries(rows.map(row => [row.user_id, row])));
    }).catch(e => { if (!cancelled) onError(e); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [classId, day, onError]);
  return <section className="ac-card" aria-label="Điểm danh lớp">
    <h2>Điểm danh</h2>
    <label>Ngày điểm danh<input type="date" required value={day} disabled={saving !== null} onChange={e => { if (e.target.value) setDay(e.target.value); }} /></label>
    <p className="ac-muted">Chọn trạng thái và lưu từng học sinh. Học sinh chưa lưu được ghi là chưa điểm danh.</p>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải điểm danh…</p> : <div className="ac-table-wrap"><table><thead><tr><th>Học sinh</th><th>Trạng thái</th><th>Ghi chú</th><th>Lưu</th></tr></thead><tbody>{students.map(student => {
      const row = entries[student.id];
      return <tr key={student.id}><td>{student.name}</td><td><select aria-label={`Điểm danh ${student.name}`} value={row?.status || ""} disabled={saving !== null} onChange={e => setEntries(old => ({ ...old, [student.id]: { user_id: student.id, note: old[student.id]?.note || "", status: e.target.value as Entry["status"] } }))}><option value="" disabled>Chưa điểm danh</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td><input aria-label={`Ghi chú ${student.name}`} maxLength={500} value={row?.note || ""} disabled={saving !== null} onChange={e => setEntries(old => ({ ...old, [student.id]: { user_id: student.id, status: old[student.id]?.status, note: e.target.value } }))} /></td><td><button className="ac-button" aria-label={`Lưu điểm danh ${student.name}`} disabled={!row?.status || saving !== null} onClick={async () => {
        setSaving(student.id); setNotice("");
        try { await api(`/classes/${classId}/students/${student.id}/attendance`, "PUT", { day, status: row.status, note: row.note }); setNotice(`Đã lưu điểm danh ${student.name}.`); } catch (e) { onError(e); } finally { setSaving(null); }
      }}>{saving === student.id ? "Đang lưu…" : "Lưu"}</button></td></tr>;
    })}</tbody></table>{!students.length && <p>Chưa có học sinh trong lớp.</p>}</div>}
  </section>;
}
