import { useEffect } from 'react';
import { QuoteList } from '../components/quotes/QuoteList.jsx';

/** Mục Quotes & highlights: mọi trích đoạn trong thư viện, tìm kiếm được, mỗi quote ghi rõ sách nguồn. */
export function QuotesPage() {
  useEffect(() => {
    document.title = 'Quotes & highlights';
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">Quotes & highlights</h1>
        <p className="mt-1 text-sm text-ink-muted">Câu trích dẫn và đoạn đánh dấu từ mọi sách. Bấm tên sách để mở trang của sách đó.</p>
      </div>
      <QuoteList />
    </div>
  );
}
