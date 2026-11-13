import { createApp } from '../app.js';
import { openDatabase } from '../db/connection.js';

/** Khởi động app trên cổng ngẫu nhiên với DB in-memory, trả về hàm gọi API và hàm dọn dẹp. */
export async function startTestServer(options = {}) {
  const { db } = openDatabase(':memory:');
  const runtime = createApp({
    db,
    storagePaths: options.storagePaths ?? null,
    clientOrigins: [],
    writeConfig: options.writeConfig ?? (() => {}),
    isEnvLocked: options.isEnvLocked ?? (() => false),
  });
  const server = await new Promise((resolve) => {
    const instance = runtime.app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  async function api(method, path, body, { headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    runtime.close();
  }

  return { api, runtime, get db() { return runtime.context.db; }, stop, baseUrl };
}
