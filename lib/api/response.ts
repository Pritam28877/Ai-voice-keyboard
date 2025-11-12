import { NextResponse } from "next/server";

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/errors";

export function jsonResponse<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function handleApiError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  console.error("API error", error);
  return NextResponse.json(
    { error: "Internal Server Error" },
    { status: 500 },
  );
}

