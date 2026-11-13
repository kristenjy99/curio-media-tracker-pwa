import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-24 text-center">
      <h1 className="font-display text-4xl">Không có trang này</h1>
      <p className="mt-3 text-ink-muted">Đường dẫn có thể đã đổi.</p>
      <Link to="/" className="mt-6 inline-block text-moss underline underline-offset-4">
        Về kệ sách
      </Link>
    </div>
  );
}
