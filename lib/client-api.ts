// All callers receive a rejected promise on HTTP failure, so drafts are not
// cleared and success UI is not shown when the server rejects a write.
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      const error = await response.clone().json().catch(() => null);
      throw new Error(error?.message || error?.error || `请求失败（${response.status}），请重试`);
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "网络连接失败，请重试";
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("life-api-error", { detail: message }));
    throw error;
  }
}
