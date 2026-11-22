import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.jsx';
import { BookDetailPage } from './pages/BookDetailPage.jsx';
import { CalendarPage } from './pages/CalendarPage.jsx';
import { BookshelfPage } from './pages/BookshelfPage.jsx';
import { GoalsPage } from './pages/GoalsPage.jsx';
import { MediaLayout } from './media/MediaLayout.jsx';
import { MediaDetailPage } from './media/MediaDetailPage.jsx';
import { MediaListPage } from './media/MediaListPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { SeriesPage } from './pages/SeriesPage.jsx';
import { QuotesPage } from './pages/QuotesPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';

// Trang thống kê kéo theo thư viện biểu đồ nên chỉ tải khi mở.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx').then((module) => ({ default: module.DashboardPage })));

const MediaStatsPage = lazy(() => import('./media/MediaStatsPage.jsx').then((module) => ({ default: module.MediaStatsPage })));

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<BookshelfPage />} />
        <Route path="dashboard" element={<Suspense fallback={<p className="py-24 text-ink-muted" role="status">Đang tải thống kê</p>}><DashboardPage /></Suspense>} />
        <Route path="media" element={<MediaLayout />}>
          <Route index element={<MediaListPage />} />
          <Route path=":id" element={<MediaDetailPage />} />
          <Route path="stats" element={<Suspense fallback={<p className="py-24 text-ink-muted" role="status">Đang tải thống kê</p>}><MediaStatsPage /></Suspense>} />
        </Route>
        <Route path="series" element={<SeriesPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="goals/:tab?" element={<GoalsPage />} />
        <Route path="books/:id" element={<BookDetailPage />} />
        <Route path="settings/:tab?" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
