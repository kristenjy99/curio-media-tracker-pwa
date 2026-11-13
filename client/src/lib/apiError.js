/** Lỗi API, dùng chung cho cả hai lớp vận chuyển (fetch trên Windows, worker trên PWA). */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `Lỗi ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details ?? [];
  }

  /** Lỗi theo trường: { title: 'Tiêu đề không được để trống', ... } (lấy phần tử đầu của path). */
  fieldErrors() {
    const result = {};
    for (const detail of this.details) {
      const key = Array.isArray(detail.path) ? detail.path.join('.') : String(detail.path ?? '');
      if (key && !result[key]) result[key] = detail.message;
    }
    return result;
  }
}

/** Tách '/items?status=TBR' thành { path, query } cho dispatcher của bản PWA. */
export function splitPath(path) {
  const [clean, rawQuery = ''] = String(path).split('?');
  const query = {};
  for (const [key, value] of new URLSearchParams(rawQuery)) {
    if (key in query) query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    else query[key] = value;
  }
  return { path: clean, query };
}

export function filenameFrom(header) {
  const match = /filename="([^"]+)"/.exec(String(header ?? ''));
  return match ? match[1] : 'export.sqlite';
}
