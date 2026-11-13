export const CATEGORIES = ['Fiction', 'Fanfiction', 'Nonfiction', 'Visual/Comics'];

export const CATEGORY_LABELS = {
  Fiction: 'Fiction',
  Fanfiction: 'Fanfiction',
  Nonfiction: 'Nonfiction',
  'Visual/Comics': 'Truyện tranh',
};

export const STATUSES = ['Reading', 'Finished', 'TBR', 'DNF'];

export const STATUS_LABELS = {
  Reading: 'Đang đọc',
  Finished: 'Đã đọc',
  TBR: 'TBR',
  DNF: 'Bỏ dở',
};

export const MEDIA_TYPES_BY_CATEGORY = {
  Fiction: ['Book', 'Ebook', 'Audiobook', 'Webnovel', 'Light Novel', 'Other'],
  Nonfiction: ['Book', 'Ebook', 'Audiobook', 'News', 'Research Paper', 'Other'],
  Fanfiction: ['Fanfic', 'Webnovel', 'Other'],
  'Visual/Comics': ['Manga', 'Manhwa', 'Manhua', 'Comic', 'Webtoon', 'Other'],
};

export const MEDIA_LABELS = {
  Book: 'Sách giấy',
  Ebook: 'Ebook',
  Audiobook: 'Sách nói',
  Fanfic: 'Fanfic',
  Webnovel: 'Web novel',
  'Light Novel': 'Light novel',
  Manga: 'Manga',
  Manhwa: 'Manhwa',
  Manhua: 'Manhua',
  Comic: 'Comic',
  Webtoon: 'Webtoon',
  News: 'News (tin/bài báo)',
  'Research Paper': 'Research paper',
  Other: 'Khác',
};

export const UNIT_LABELS = {
  pages: 'Trang',
  chapters: 'Chương',
  volumes: 'Volume',
  words: 'Chữ',
  minutes: 'Phút',
  percent: '%',
};

export const DEFAULT_UNIT = { Fiction: 'pages', Nonfiction: 'pages', Fanfiction: 'chapters', 'Visual/Comics': 'volumes' };
export const DEFAULT_MEDIA = { Fiction: 'Book', Nonfiction: 'Book', Fanfiction: 'Fanfic', 'Visual/Comics': 'Manga' };

export const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Mới cập nhật' },
  { value: 'last_read_date', label: 'Đọc gần đây' },
  { value: 'title', label: 'Tên A–Z' },
  { value: 'rating', label: 'Rating cao' },
  { value: 'release_year', label: 'Năm phát hành' },
];

export const SYNC_ACTION_LABELS = {
  create_file: 'Tạo file mới',
  recreate_file: 'Tạo lại file đã bị xoá trong vault',
  write_file: 'Cập nhật file',
  move_file: 'Chuyển file vào đúng thư mục thể loại',
  overwrite_external_edit: 'Ghi đè file đã sửa trong Obsidian (bản cũ được giữ thành .conflict)',
  trash_file: 'Chuyển file của sách đã xoá vào .trash',
  sync_media: 'Chép ảnh và file đính kèm vào _attachments',
  trash_media: 'Chuyển thư mục ảnh của sách đã xoá vào .trash',
  track_move: 'Ghi nhận file đã đổi tên hoặc di chuyển',
  import_file: 'Nhập thay đổi từ Obsidian',
  import_new: 'Thêm sách mới từ Obsidian',
  conflict: 'Sửa ở cả hai phía (bên sửa sau thắng)',
  ignored: 'Bỏ qua file không do app tạo',
  skip: 'Bỏ qua file lỗi',
  drop_tombstone: 'Dọn ghi nhớ sách đã xoá',
  failed: 'Lỗi khi thực hiện',
};
