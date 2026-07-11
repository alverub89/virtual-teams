import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// Hash de senha com scrypt (nativo do Node, sem dependência externa).
export function hashPassword(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(senha: string, armazenado: string): boolean {
  const [salt, hash] = armazenado.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(senha, salt, 64);
  const original = Buffer.from(hash, "hex");
  return original.length === derived.length && timingSafeEqual(original, derived);
}
