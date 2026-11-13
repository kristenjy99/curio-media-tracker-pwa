export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource, id) {
    super(`${resource} #${id} không tồn tại`, { status: 404, code: 'NOT_FOUND' });
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { status: 400, code: 'VALIDATION_ERROR', details });
  }
}

export class ConflictError extends AppError {
  constructor(message, details) {
    super(message, { status: 409, code: 'CONFLICT', details });
  }
}
