import { CustomerApiError } from "@/app/(customer)/_lib/customerApi";

export interface StreamHandlers<T = unknown> {
  onThread?: (data: { id?: number; token?: string }) => void;
  onDelta?: (text: string) => void;
  onDone?: (data: T) => void;
  onError?: (data: { message: string; kind: string }) => void;
}

/** Reads a server-sent-events reply (`event: delta|done|error`) as it streams in. */
export async function readStream<T>(res: Response, on: StreamHandlers<T>) {
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    const errors = Object.fromEntries(
      Object.entries((body.errors ?? {}) as Record<string, string[]>).map(([k, v]) => [k, v[0] ?? ""])
    );
    throw new CustomerApiError(body.message ?? "Something went wrong.", res.status, errors);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut = buffer.indexOf("\n\n");
    while (cut >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf("\n\n");
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      const parsed = JSON.parse(data);
      if (event === "thread") on.onThread?.(parsed);
      else if (event === "delta") on.onDelta?.(parsed.text);
      else if (event === "done") on.onDone?.(parsed);
      else if (event === "error") on.onError?.(parsed);
    }
  }
}
