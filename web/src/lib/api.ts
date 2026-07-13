import { useQuery } from "@tanstack/react-query";
import type { Me } from "../../../shared/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// "Auditar como squad": o CTO escolhe uma squad e passa a ver a plataforma
// com a visão dela (somente leitura). Guardamos a escolha no localStorage e
// injetamos o header em toda chamada.
const AUDIT_KEY = "aiw_auditar_squad";
export function getAuditSquad(): { id: string; nome: string } | null {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    return raw ? (JSON.parse(raw) as { id: string; nome: string }) : null;
  } catch {
    return null;
  }
}
export function setAuditSquad(sq: { id: string; nome: string } | null) {
  if (sq) localStorage.setItem(AUDIT_KEY, JSON.stringify(sq));
  else localStorage.removeItem(AUDIT_KEY);
  window.dispatchEvent(new Event("aiw-audit-change"));
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const aud = getAuditSquad();
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(aud ? { "x-auditar-squad": aud.id } : {}), ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const put = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });

export function useMe() {
  return useQuery<Me, ApiError>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me"),
    retry: false,
    staleTime: Infinity,
  });
}

/* Bate-papo livre com um agente (SSE). historico = mensagens anteriores. */
export async function streamAssistente(
  agenteId: string | undefined,
  mensagem: string,
  historico: { role: "user" | "assistant"; content: string }[],
  onDelta: (delta: string) => void
): Promise<void> {
  const res = await fetch(`/api/assistente/chat`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agenteId, mensagem, historico }),
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, "falha no assistente");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const eventos = buffer.split("\n\n");
    buffer = eventos.pop() ?? "";
    for (const ev of eventos) {
      const payload = ev.replace(/^data: /, "").trim();
      if (!payload) continue;
      const data = JSON.parse(payload) as { delta?: string; error?: string };
      if (data.error) throw new ApiError(500, data.error);
      if (data.delta) onDelta(data.delta);
    }
  }
}

/* Consome o SSE do chat (POST + ReadableStream). */
export async function streamChat(
  codigo: string,
  etapa: number,
  mensagem: string,
  onDelta: (delta: string) => void
): Promise<void> {
  const res = await fetch(`/api/iniciativas/${codigo}/chat`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mensagem, etapa }),
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, "falha no chat");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const eventos = buffer.split("\n\n");
    buffer = eventos.pop() ?? "";
    for (const ev of eventos) {
      const payload = ev.replace(/^data: /, "").trim();
      if (!payload) continue;
      const data = JSON.parse(payload) as { delta?: string; error?: string };
      if (data.error) throw new ApiError(500, data.error);
      if (data.delta) onDelta(data.delta);
    }
  }
}
