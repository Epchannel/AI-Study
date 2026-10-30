"use client";

import { useEffect, useState } from "react";
import { academyRequest, type Message } from "@/lib/academy-api";

export function AcademyChatImages({ threadId, images }: { threadId: string; images?: Message["images"] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const created: string[] = [];
    let disposed = false;

    async function load() {
      if (!images?.length) {
        setUrls([]);
        return;
      }
      setUrls([]);
      try {
        const next = await Promise.all(images.map(async (image) => {
          const response = await academyRequest(`/threads/${threadId}/images/${image.id}`, { signal: controller.signal });
          const url = URL.createObjectURL(await response.blob());
          created.push(url);
          return url;
        }));
        if (!disposed) setUrls(next);
      } catch {
        if (!disposed) setUrls([]);
      } finally {
        if (disposed) created.forEach((url) => URL.revokeObjectURL(url));
      }
    }
    void load();
    return () => {
      disposed = true;
      controller.abort();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [threadId, images]);
  if (!urls.length) return null;
  // Authenticated Blob URLs are not eligible for Next's image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="ac-history-images">{urls.map((url, index) => <img key={url} src={url} alt={images?.[index]?.name || "Ảnh đính kèm"} />)}</div>;
}
