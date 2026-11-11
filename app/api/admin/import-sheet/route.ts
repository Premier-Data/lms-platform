import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  return (
    roles?.some((r) => r.role === "admin" || r.role === "super_admin") ?? false
  );
}

// Only Google's own hosts may be contacted (Sheets exports redirect to a
// *.googleusercontent.com host). This keeps the endpoint from being used to
// fetch arbitrary URLs.
function isAllowedHost(hostname: string): boolean {
  return (
    hostname === "docs.google.com" || hostname.endsWith(".googleusercontent.com")
  );
}

const MAX_BYTES = 2 * 1024 * 1024;

// POST /api/admin/import-sheet  { url }  ->  { csv }
// Fetches a link-shared Google Sheet as CSV so the browser can parse it.
export async function POST(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  const idMatch = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(
    url
  );
  if (!idMatch) {
    return NextResponse.json(
      { error: "Enter a Google Sheets link (docs.google.com/spreadsheets/…)." },
      { status: 400 }
    );
  }
  const gid = /[?&#]gid=(\d+)/.exec(url)?.[1];

  let current = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv${
    gid ? `&gid=${gid}` : ""
  }`;

  try {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        const next = new URL(location, current);
        if (next.protocol !== "https:" || !isAllowedHost(next.hostname)) {
          return NextResponse.json(
            {
              error:
                "Couldn't read the sheet. Set sharing to “Anyone with the link can view”, or download it as CSV and upload the file instead.",
            },
            { status: 400 }
          );
        }
        current = next.toString();
        continue;
      }

      if (!res.ok) {
        return NextResponse.json(
          { error: `Google returned an error (${res.status}).` },
          { status: 400 }
        );
      }

      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("csv") && !type.includes("text/plain")) {
        return NextResponse.json(
          {
            error:
              "Couldn't read the sheet as CSV. Check it is shared as “Anyone with the link can view”.",
          },
          { status: 400 }
        );
      }

      const text = await res.text();
      if (text.length > MAX_BYTES) {
        return NextResponse.json(
          { error: "That sheet is too large to import (limit 2 MB)." },
          { status: 400 }
        );
      }
      return NextResponse.json({ csv: text });
    }
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Google Sheets. Try again, or upload a CSV." },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { error: "Too many redirects while reading the sheet." },
    { status: 400 }
  );
}
