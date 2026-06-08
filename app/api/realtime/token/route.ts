import { REALTIME_NOVICE_PROMPT } from "@/lib/realtimePrompt";

export const runtime = "nodejs";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Curio voice is not configured on this server." },
      { status: 503 },
    );
  }

  const model = process.env.REALTIME_MODEL ?? "gpt-realtime";

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "realtime",
          model,
          output_modalities: ["audio"],
          instructions: REALTIME_NOVICE_PROMPT,
          audio: {
            input: {
              transcription: { model: "gpt-4o-mini-transcribe" },
              noise_reduction: { type: "near_field" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 900,
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: "marin" },
          },
        },
      }),
    });

    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error("Realtime client secret request failed", upstream.status, payload);
      return Response.json(
        { error: "Curio could not start a voice session." },
        { status: 502 },
      );
    }

    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Realtime client secret request failed", error);
    return Response.json(
      { error: "Curio could not reach the voice service." },
      { status: 502 },
    );
  }
}
