import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, NotebookPen, Quote, Stamp, SquarePen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookHeader } from '../components/detail/BookHeader.jsx';
import { LibraryCardTab } from '../components/detail/LibraryCardTab.jsx';
import { NoteTab } from '../components/detail/NoteTab.jsx';
import { ReadingLogTab } from '../components/detail/ReadingLogTab.jsx';
import { QuoteList } from '../components/quotes/QuoteList.jsx';
import { useLibraryActions } from '../components/layout/LibraryActions.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ErrorNote } from '../components/ui/ErrorNote.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { TabPanel, Tabs } from '../components/ui/Tabs.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useInvalidateLibrary, useItem } from '../hooks/queries.js';
import { api } from '../lib/api.js';

const TABS = ['note', 'card', 'log', 'quotes'];

export function BookDetailPage() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'note';
  const item = useItem(Number.isInteger(id) && id > 0 ? id : null);
  const invalidate = useInvalidateLibrary();
  const client = useQueryClient();
  const { openEditBook } = useLibraryActions();
  const toast = useToast();
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  // Quay lại đúng kệ/bộ lọc đã mở trước đó (state do kệ sách truyền khi điều hướng).
  const backTo = location.state?.from ?? '/';

  useEffect(() => {
    if (item.data?.title) document.title = item.data.title;
  }, [item.data?.title]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  const setTab = (next) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === 'note') copy.delete('tab');
        else copy.set('tab', next);
        return copy;
      },
      { replace: true, state: location.state },
    );

  if (!Number.isInteger(id) || id <= 0 || item.error?.status === 404) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-3xl">Không tìm thấy sách này</p>
        <p className="mt-2 text-ink-muted">Sách có thể đã bị xoá.</p>
        <Link to="/" className="mt-5 inline-block text-moss underline-offset-4 hover:underline">
          Về kệ sách
        </Link>
      </div>
    );
  }
  if (item.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-ink-muted">
        <Spinner /> Đang mở sách
      </div>
    );
  }
  if (item.error) return <ErrorNote error={item.error} />;
  const book = item.data;

  const refresh = () => {
    invalidate();
    client.invalidateQueries({ queryKey: ['reading-logs', book.id] });
  };

  async function toggleFavorite() {
    setFavoriteBusy(true);
    try {
      await api.patch(`/items/${book.id}`, { is_favorite: !book.is_favorite });
      toast(book.is_favorite ? 'Đã bỏ khỏi yêu thích' : 'Đã thêm vào yêu thích');
      invalidate();
    } catch (error) {
      toast(error.message, { tone: 'error' });
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function markFixed() {
    try {
      await api.patch(`/items/${book.id}`, { import_issues: null });
      toast('Đã đánh dấu sửa xong');
      invalidate();
    } catch (error) {
      toast(error.message, { tone: 'error' });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {book.import_issues?.length > 0 && (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-xl border border-honey/60 bg-honey/10 p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Sách này import bị lỗi, hãy kiểm tra và sửa lại thông tin:</p>
            <ul className="mt-1 list-disc pl-5 text-ink-muted">
              {book.import_issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </div>
          <Button size="sm" onClick={() => openEditBook(book.id)}>Sửa thông tin</Button>
          <Button size="sm" variant="primary" onClick={markFixed}>Đã sửa xong</Button>
        </div>
      )}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(backTo)} className="-ml-2">
          <ArrowLeft size={16} /> Kệ sách
        </Button>
      </div>
      <BookHeader
        item={book}
        onEdit={() => openEditBook(book.id, { onDeleted: () => navigate(backTo, { replace: true }) })}
        onToggleFavorite={toggleFavorite}
        favoriteBusy={favoriteBusy}
        onLogToday={() => setTab('log')}
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Nội dung sách"
        tabs={[
          { value: 'note', label: 'Note & Review', icon: <SquarePen size={16} aria-hidden /> },
          { value: 'card', label: 'Thẻ thư viện', icon: <Stamp size={16} aria-hidden />, badge: book.library_cards.length },
          { value: 'log', label: 'Nhật ký đọc', icon: <NotebookPen size={16} aria-hidden /> },
          { value: 'quotes', label: 'Quotes', icon: <Quote size={16} aria-hidden /> },
        ]}
      >
        <TabPanel value="note">
          <NoteTab item={book} />
        </TabPanel>
        <TabPanel value="card">
          <LibraryCardTab item={book} onChanged={refresh} />
        </TabPanel>
        <TabPanel value="log">
          <ReadingLogTab item={book} onChanged={refresh} />
        </TabPanel>
        <TabPanel value="quotes">
          <QuoteList itemId={book.id} />
        </TabPanel>
      </Tabs>
    </div>
  );
}
