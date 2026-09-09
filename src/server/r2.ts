import type { BlobStore } from "./documents.ts";

export interface OriginalBucket {
  put(key: string, value: Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
}
export function r2Originals(bucket: OriginalBucket): BlobStore {
  return {
    async put(key, bytes) {
      await bucket.put(key, bytes);
    },
    async get(key) {
      const object = await bucket.get(key);
      return object ? new Uint8Array(await object.arrayBuffer()) : undefined;
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}
