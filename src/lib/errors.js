/**
 * Error yang sudah punya status HTTP dan kode terstruktur.
 * Semua error yang dilempar dari route sebaiknya memakai kelas ini
 * supaya handler terakhir bisa mengembalikan bentuk JSON yang konsisten.
 */
export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details = null) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static notFound(message, details = null) {
    return new ApiError(404, 'NOT_FOUND', message, details);
  }

  static conflict(message, details = null) {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static unprocessable(message, details = null) {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
}
