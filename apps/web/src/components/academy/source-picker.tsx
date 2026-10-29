"use client";

import { useEffect, useState } from "react";
import { api, type Classroom, type Material } from "@/lib/academy-api";

export function SourcePicker({ classes, classId, materialId, disabled, onChange, onError }: {
  classes: Classroom[]; classId: string; materialId: string; disabled: boolean;
  onChange: (classId: string, materialId: string) => void; onError: (e: unknown) => void;
}) {
  const [result, setResult] = useState<{ classId: string; rows: Material[] } | null>(null);
  useEffect(() => {
    if (!classId) return;
    let active = true;
    api<Material[]>(`/classes/${classId}/materials`).then(rows => {
      if (active) setResult({ classId, rows: rows.filter(row => row.status !== "archived") });
    }).catch(e => { if (active) { setResult({ classId, rows: [] }); onError(e); } });
    return () => { active = false; };
  }, [classId, onError]);
  const ready = result?.classId === classId;
  const rows = ready ? result.rows : [];
  return <div className="ac-source-picker">
    <select aria-label="Nguồn học liệu" value={classId} disabled={disabled} onChange={e => onChange(e.target.value, "")}><option value="">Kiến thức chung</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    {classId && <select aria-label="Tài liệu trong chat" value={materialId} disabled={disabled || !ready} onChange={e => onChange(classId, e.target.value)}>
      <option value="">{ready ? "Tất cả tài liệu của lớp" : "Đang tải tài liệu…"}</option>
      {materialId && !rows.some(row => row.id === materialId) && <option value={materialId}>Tài liệu cũ · chọn lại nếu không khả dụng</option>}
      {rows.map(row => <option key={row.id} value={row.id}>{row.title} · v{row.data.version}{row.status === "draft" ? " · Nháp" : ""}</option>)}
    </select>}
  </div>;
}
