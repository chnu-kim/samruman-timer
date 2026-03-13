import { fireSessionExpired } from "./session-expired";

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    fireSessionExpired();
  }
  return res;
}
