import { createAuthClient } from "better-auth/client";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/auth";

export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  credentials: "include",
});
