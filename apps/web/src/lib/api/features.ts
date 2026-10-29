import { request } from "./client";
import { ttlCache } from "@/lib/cache";

export interface FeatureFlags {
  loom: boolean;
  lector: boolean;
  cat_pretest: boolean;
  browser: boolean;
  vision: boolean;
  notion_export: boolean;
}

let pendingFlags: Promise<FeatureFlags> | undefined;

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const cached = ttlCache.get<FeatureFlags>("api:features");
  if (cached) return cached;
  if (!pendingFlags) {
    pendingFlags = request<FeatureFlags>("/features")
      .then((flags) => {
        ttlCache.set("api:features", flags, 30_000);
        return flags;
      })
      .finally(() => { pendingFlags = undefined; });
  }
  return pendingFlags;
}
