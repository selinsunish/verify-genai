const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type GatewayContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GatewayError";
  }
}

/**
 * Calls the Lovable AI Gateway chat endpoint with streaming enabled and
 * returns the accumulated assistant text. Streaming is used even though the
 * feature is one-shot: long multimodal analyses would otherwise be severed by
 * the platform request timeout.
 */
export async function callGatewayText(options: {
  model: string;
  system: string;
  content: GatewayContentBlock[];
}): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new GatewayError(401, "The analysis service is not configured.");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: options.model,
      stream: true,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.content },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    let message = `Analysis failed (${response.status}).`;
    try {
      const body = await response.text();
      const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message ?? parsed.message ?? message;
    } catch {
      /* keep default message */
    }
    throw new GatewayError(response.status, message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        const delta = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content;
        if (delta) text += delta;
      } catch {
        /* ignore keep-alive / partial frames */
      }
    }
  }

  return text;
}
