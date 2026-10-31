// An R2 bucket stand-in (put, get, delete) over a Map, for unit tests.
export function fakeR2() {
  const objects = new Map<string, Uint8Array>();
  const bucket = {
    async put(key: string, value: ArrayBuffer | Uint8Array) {
      objects.set(key, value instanceof Uint8Array ? value.slice() : new Uint8Array(value));
      return { key };
    },
    async get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        key,
        size: bytes.length,
        get body() {
          return new Response(bytes.slice()).body;
        },
        arrayBuffer: async () => bytes.slice().buffer,
      };
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
    },
  };
  return { bucket: bucket as unknown as R2Bucket, objects };
}
