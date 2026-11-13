import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Chặn lỗi render của một trang để nó không làm trắng cả app.
 *
 * Trước khi có lớp này, một lỗi ở bất kỳ trang nào (ví dụ gọi sai API của một component dùng chung)
 * làm React gỡ toàn bộ cây giao diện: màn hình trắng, bấm Back cũng không về được vì không còn gì
 * để render. Nay phần khung (thanh trên, điều hướng) vẫn còn, chỉ phần thân báo lỗi, và người dùng
 * đọc được thông báo để gửi lại thay vì chỉ thấy trắng.
 *
 * `resetKey` đổi theo đường dẫn: chuyển sang trang khác thì bỏ trạng thái lỗi và thử render lại.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, key: props.resetKey };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Lỗi khi hiển thị trang:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-2 flex items-center gap-2 font-display text-2xl">
          <AlertTriangle size={20} /> Trang này gặp lỗi
        </h2>
        <p className="mb-3 text-ink-muted">
          Phần còn lại của app vẫn dùng được: chọn một mục khác trên thanh trên để đi tiếp. Nếu lỗi lặp lại, gửi đoạn dưới đây để sửa.
        </p>
        <pre className="max-h-64 overflow-auto rounded-xl bg-paper p-3 text-xs text-ink-soft">{String(this.state.error?.message ?? this.state.error)}</pre>
      </section>
    );
  }
}
