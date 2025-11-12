export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class BadRequestError extends Error {
  constructor(message: string = "Bad Request") {
    super(message);
    this.name = "BadRequestError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string = "Not Found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

