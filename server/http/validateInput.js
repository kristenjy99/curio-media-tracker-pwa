/**
 * Parse params / query / body bằng zod, trả về object `valid` mà handler dùng.
 * Dùng chung cho middleware Express và bộ điều phối route của PWA, nên không phụ thuộc Express.
 */
export function applyValidation({ params, query, body } = {}, request) {
  return {
    params: params ? params.parse(request.params ?? {}) : request.params ?? {},
    query: query ? query.parse(request.query ?? {}) : {},
    body: body ? body.parse(request.body ?? {}) : request.body,
  };
}
