import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/api/webhooks/stripe", "/api/health"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const username = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Basic ")) {
    const encodedCredentials = authorization.split(" ")[1];
    const decodedCredentials = atob(encodedCredentials);
    const [providedUsername, providedPassword] = decodedCredentials.split(":");

    if (providedUsername === username && providedPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="BravoClient"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
