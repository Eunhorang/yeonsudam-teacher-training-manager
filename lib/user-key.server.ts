export async function userKeyFromEmail(email: string) {
  const normalized = email.trim().toLocaleLowerCase("en-US");
  const bytes = new TextEncoder().encode(`yeonsudam\0${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
