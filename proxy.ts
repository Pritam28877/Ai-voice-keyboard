export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    "/dictation/:path*",
    "/history/:path*",
    "/dictionary/:path*",
    "/settings/:path*",
  ],
};

