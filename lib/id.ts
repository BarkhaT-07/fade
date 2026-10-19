import { randomBytes } from "crypto";

export function generateNoteId(): string {
  return randomBytes(18).toString("base64url");
}
