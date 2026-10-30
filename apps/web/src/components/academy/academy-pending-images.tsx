"use client";
import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
export function AcademyPendingImages({ images, onRemove }: { images: File[]; onRemove: (index: number) => void }) {
  const urls = useMemo(() => images.map((image) => URL.createObjectURL(image)), [images]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);

  // Local Blob URLs are not eligible for Next's image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="ac-chat-images">{images.map((image, index) => <span key={`${image.name}-${index}`}><img src={urls[index]} alt="Xem trước ảnh đính kèm" />{image.name}<button type="button" aria-label={`Xóa ${image.name}`} onClick={() => onRemove(index)}><X size={12} /></button></span>)}</div>;
}
