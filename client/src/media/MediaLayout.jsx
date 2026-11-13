import { Outlet } from 'react-router-dom';

/** Khung tab Medias. Các tab nhỏ (Danh sách, Thống kê) hiển thị ở AppShell cùng hàng với tab nhỏ của Books. */
export function MediaLayout() {
  return <Outlet />;
}
