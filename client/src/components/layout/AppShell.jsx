import { setUiLanguage } from '../../i18n/translator.js';
import { CloudUpload, Moon, RefreshCw, Settings, Sun, Upload, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSettings } from '../../hooks/queries.js';
import { useTheme } from '../../hooks/useTheme.js';
import { applyAppearance } from '../../lib/appearance.js';
import { cn } from '../../lib/utils.js';
import { CatMark } from '../bookshelf/Cat.jsx';
import { BookFormDialog } from '../books/BookFormDialog.jsx';
import { ImportDialog } from '../import/ImportDialog.jsx';
import { SyncDialog } from '../sync/SyncDialog.jsx';
import { DriveSyncDialog } from '../sync/DriveSyncDialog.jsx';
import { Button } from '../ui/Button.jsx';
import { LibraryActionsContext } from './LibraryActions.jsx';
import { IS_PWA, resolveFileUrl } from '../../lib/api.js';
import { StorageWarning } from './StorageWarning.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';

const navClass = ({ isActive }) =>
  cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', isActive ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink');

const sectionClass = (active) =>
  cn('rounded-lg px-3.5 py-1.5 text-base font-semibold transition-colors', active ? 'bg-moss text-on-moss' : 'text-ink-muted hover:bg-surface-2 hover:text-ink');

// Tab nhỏ của từng tab lớn. `end` chỉ cần cho đường dẫn gốc.
const BOOK_TABS = [
  { to: '/', label: 'Kệ sách', end: true },
  { to: '/calendar', label: 'Lịch đọc' },
  { to: '/goals', label: 'Mục tiêu' },
  { to: '/dashboard', label: 'Thống kê' },
];
const MEDIA_TABS = [
  { to: '/media', label: 'Danh sách', end: true },
  { to: '/media/stats', label: 'Thống kê' },
];

// Chia app thành hai tab lớn theo đường dẫn; Cài đặt dùng chung nên không thuộc tab nào.
function sectionOf(pathname) {
  if (pathname.startsWith('/media')) return 'media';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/series')) return 'series';
  return 'books';
}

function BackgroundLayer({ appearance }) {
  if (!appearance?.background_image) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center"
      style={{ backgroundImage: `url("${resolveFileUrl(appearance.background_image)}")`, opacity: appearance.background_opacity }}
    />
  );
}

export function AppShell() {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const section = sectionOf(pathname);
  const subTabs = section === 'books' ? BOOK_TABS : section === 'media' ? MEDIA_TABS : [];
  const settings = useSettings();
  const appearance = settings.data?.appearance;
  const appName = settings.data?.general?.app_name ?? 'Media Tracker';
  const themes = settings.data?.themes;
  const uiLanguage = settings.data?.general?.ui_language;
  useEffect(() => {
    if (uiLanguage) setUiLanguage(uiLanguage);
  }, [uiLanguage]);
  useEffect(() => {
    if (appearance) applyAppearance(appearance, themes ?? []);
  }, [appearance, themes]);
  useEffect(() => {
    document.title = appName;
  }, [appName]);
  const appIcon = settings.data?.general?.app_icon;
  useEffect(() => {
    if (!settings.data) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = appIcon ? 'image/png' : 'image/svg+xml';
    link.href = appIcon || '/favicon.svg';
  }, [appIcon, settings.data]);
  const [bookDialog, setBookDialog] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);

  const actions = useMemo(
    () => ({
      openNewBook: (category) => setBookDialog({ mode: 'create', category }),
      openEditBook: (id, options = {}) => setBookDialog({ mode: 'edit', id, onDeleted: options.onDeleted }),
      openImport: () => setImportOpen(true),
      openSync: () => setSyncOpen(true),
    }),
    [],
  );

  return (
    <LibraryActionsContext.Provider value={actions}>
      <BackgroundLayer appearance={appearance} />
      <div className="relative min-h-screen">
        {IS_PWA && <StorageWarning />}
        <header className="border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 sm:px-8">
            <NavLink to="/" className="flex items-center gap-2.5" aria-label={`${appName}, về trang chính`}>
              {appIcon ? <img src={resolveFileUrl(appIcon)} alt="" className="h-7 w-7 rounded-md object-contain" /> : <CatMark />}
              <span className="font-display text-2xl font-semibold tracking-tight">{appName}</span>
            </NavLink>
            <nav className="flex items-center gap-1" aria-label="Tab chính">
              <Link to="/" className={sectionClass(section === 'books')} aria-current={section === 'books' ? 'page' : undefined}>
                Books
              </Link>
              <Link to="/media" className={sectionClass(section === 'media')} aria-current={section === 'media' ? 'page' : undefined}>
                Medias
              </Link>
              <Link to="/series" className={sectionClass(section === 'series')} aria-current={section === 'series' ? 'page' : undefined}>
                Series
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {section === 'books' && (
                <>
                  {/* Sync Obsidian đọc/ghi vault trên đĩa nên chỉ có ở bản Windows. */}
                  {!IS_PWA && (
                    <Button variant="ghost" size="md" onClick={() => setSyncOpen(true)} title="Ghi sách sang Obsidian">
                      <RefreshCw size={16} /> <span className="hidden sm:inline">Sync Obsidian</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="md" onClick={() => setImportOpen(true)}>
                    <Upload size={16} /> <span className="hidden sm:inline">Import</span>
                  </Button>
                  <Button variant="primary" onClick={() => actions.openNewBook()}>
                    <Plus size={16} /> Thêm sách
                  </Button>
                </>
              )}
              {/* Đồng bộ Google Drive: có ở cả bản Windows và bản điện thoại, mọi tab. */}
              <Button variant="ghost" size="md" onClick={() => setDriveOpen(true)} title="Đồng bộ với Google Drive">
                <CloudUpload size={16} /> <span className="hidden sm:inline">Đồng bộ</span>
              </Button>
              <NavLink to="/settings" className={({ isActive }) => cn('rounded-lg p-2.5 hover:bg-surface-2 hover:text-ink', isActive ? 'bg-surface-2 text-ink' : 'text-ink-muted')} aria-label="Cài đặt" title="Cài đặt">
                <Settings size={18} />
              </NavLink>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
            </div>
          </div>
          {subTabs.length > 0 && (
            <nav className="mx-auto flex max-w-[1400px] items-center gap-1 px-5 pb-2 sm:px-8" aria-label={section === 'media' ? 'Tab Medias' : 'Tab Books'}>
              {subTabs.map((tab) => (
                <NavLink key={tab.to} to={tab.to} end={tab.end} className={navClass}>
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          )}
        </header>
        <main className="mx-auto max-w-[1400px] px-5 pb-20 pt-6 sm:px-8">
          {/* Lỗi ở một trang chỉ làm hỏng phần thân, không làm trắng cả app. */}
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      {bookDialog && <BookFormDialog key={bookDialog.id ?? 'new'} {...bookDialog} onClose={() => setBookDialog(null)} />}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      {!IS_PWA && <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} />}
      <DriveSyncDialog open={driveOpen} onOpenChange={setDriveOpen} />
    </LibraryActionsContext.Provider>
  );
}
