/**
 * Server-side proxy to the Functions API (SPEC §9).
 * - The browser never talks to Functions directly, so no CORS and no key in the browser.
 * - Identity comes from App Service Authentication headers on Azure; DEV_USER_* locally.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 230;

const onAzure = () => Boolean(process.env.WEBSITE_SITE_NAME);

type Identity = { email: string; name: string };

function readIdentity(req: NextRequest): Identity | null {
  const principalName = req.headers.get("x-ms-client-principal-name");
  if (principalName) {
    let name = principalName;
    const encoded = req.headers.get("x-ms-client-principal");
    if (encoded) {
      try {
        const principal = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
          claims?: { typ: string; val: string }[];
        };
        const claim = principal.claims?.find((c) => c.typ === "name");
        if (claim?.val) name = claim.val;
      } catch {
        // fall back to principal name
      }
    }
    return { email: principalName.toLowerCase(), name };
  }
  if (!onAzure() && process.env.DEV_USER_EMAIL) {
    return { email: process.env.DEV_USER_EMAIL, name: process.env.DEV_USER_NAME || process.env.DEV_USER_EMAIL };
  }
  return null;
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const backend = process.env.BACKEND_URL;
  if (!backend) {
    return errorResponse(500, "CONFIG_ERROR", "BACKEND_URL が設定されていません。管理者に連絡してください。");
  }
  const identity = readIdentity(req);
  if (!identity) {
    return errorResponse(401, "UNAUTHENTICATED", "ログイン情報を確認できませんでした。画面を再読み込みしてサインインし直してください。");
  }

  const target = `${backend.replace(/\/$/, "")}/${params.path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  headers.set("x-poccompass-user-email", identity.email);
  headers.set("x-poccompass-user-name", encodeURIComponent(identity.name));
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (process.env.BACKEND_FUNCTION_KEY) headers.set("x-functions-key", process.env.BACKEND_FUNCTION_KEY);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
    const body = res.status === 204 ? null : await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return errorResponse(502, "BACKEND_UNREACHABLE", "サーバーに接続できませんでした。時間をおいて再度お試しください。");
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
