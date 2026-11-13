const DEFAULT_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];

/**
 * Chặn DNS rebinding: một trang web lạ có thể trỏ tên miền của nó về 127.0.0.1 để gọi API local.
 * Trình duyệt vẫn gửi Host là tên miền lạ đó, nên chỉ chấp nhận Host là địa chỉ loopback.
 */
export function hostGuard(allowedHosts = DEFAULT_HOSTS) {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  return (req, res, next) => {
    const hostname = (req.hostname ?? '').toLowerCase();
    if (allowed.has(hostname)) return next();
    return res.status(403).json({ error: { code: 'FORBIDDEN_HOST', message: `Host "${hostname}" không được phép` } });
  };
}
