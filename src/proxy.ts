import { NextResponse } from "next/server"
import { auth } from "@/auth"

export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const path = req.nextUrl.pathname;

  if (isLoggedIn && !path.startsWith('/validate') && path !== '/login' && path !== '/setup') {
    const validated = req.cookies.get('config_validated');
    if (!validated) {
      return NextResponse.redirect(new URL('/validate', req.url));
    }
  }
  
  return NextResponse.next();
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.png|icon.png).*)"],
}
