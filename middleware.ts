export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    "/dictation/:path*",
    "/history/:path*",
    "/dictionary/:path*",
    "/settings/:path*",
  ],
};

