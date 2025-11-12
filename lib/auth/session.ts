import { auth } from "@/auth";
import { UnauthorizedError } from "@/lib/errors";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return session.user;
}

