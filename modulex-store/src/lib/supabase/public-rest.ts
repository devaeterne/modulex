import "server-only";

type PublicRpcBody = Record<string, unknown>;
type PublicRpcOptions = { revalidate?: number };

function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Public Supabase configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, publishableKey };
}

export function getPublicStorageObjectUrl(bucket: string, objectPath: string) {
  const { url } = getPublicSupabaseConfig();
  const safeBucket = encodeURIComponent(bucket.trim());
  const safePath = objectPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  if (!safeBucket || !safePath) throw new Error("Public storage locator is incomplete.");
  return `${url}/storage/v1/object/public/${safeBucket}/${safePath}`;
}

export async function callPublicRpc<T>(rpcName: string, body: PublicRpcBody = {}, options: PublicRpcOptions = {}): Promise<T> {
  const { url, publishableKey } = getPublicSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: options.revalidate ?? 300 },
  });
  if (!response.ok) {
    console.error("Public Supabase RPC failed", { rpcName, status: response.status });
    throw new Error("Unable to load public Store data.");
  }
  return (await response.json()) as T;
}
