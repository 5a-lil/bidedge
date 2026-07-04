import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";

// Protection des routes de pages : sans session valide, on redirige vers
// /login. Le contrôle super-admin de /admin se fait dans son layout (accès DB
// impossible en Edge). Les routes /api gèrent elles-mêmes leur auth (401 JSON).

const PUBLIC_PREFIXES = ["/home", "/login", "/onboarding"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("bidedge_session")?.value;
  const authed = token ? (await verifySession(token)) !== null : false;

  if (authed && (pathname === "/login" || pathname === "/onboarding")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Visiteur anonyme sur la racine → il voit la LANDING (rewrite : l'URL
  // reste "/"). Connecté, "/" reste le radar.
  if (!authed && pathname === "/") {
    return NextResponse.rewrite(new URL("/home", req.url));
  }

  if (!authed && !isPublic(pathname)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // exclut /api, les assets Next, et tout fichier avec extension (statique)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
