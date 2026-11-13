import * as Tabs from '@radix-ui/react-tabs';
import { useNavigate, useParams } from 'react-router-dom';
import { AppearanceSettings } from '../components/settings/AppearanceSettings.jsx';
import { DataSettings } from '../components/settings/DataSettings.jsx';
import { LanguageSettings } from '../components/settings/LanguageSettings.jsx';
import { ObsidianSettings } from '../components/settings/ObsidianSettings.jsx';
import { StorageSettings } from '../components/settings/StorageSettings.jsx';
import { TemplateEditor } from '../components/settings/TemplateEditor.jsx';
import { FandomLibrary } from '../components/settings/FandomLibrary.jsx';
import { IS_PWA } from '../lib/api.js';

function TemplateAndFandoms() {
  return (
    <div className="flex flex-col gap-8">
      <TemplateEditor />
      <FandomLibrary />
    </div>
  );
}

/**
 * `nodeOnly` là những mục cần đĩa hoặc Windows: chọn vault Obsidian và chọn thư mục lưu trữ.
 * Trên bản PWA các route tương ứng đã bị lọc khỏi dispatcher (xem server/routes/routeTable.js),
 * nên mục cài đặt cũng bị ẩn thay vì để người dùng bấm vào rồi nhận lỗi 404.
 */
const ALL_TABS = [
  { value: 'obsidian', label: 'Obsidian', nodeOnly: true, description: 'Chọn vault và cách sync sách sang Obsidian.', Component: ObsidianSettings },
  { value: 'template', label: 'Template', description: 'Property và phần thân mẫu của file .md cho từng thể loại; kho fandom & cặp đôi.', Component: TemplateAndFandoms },
  { value: 'appearance', label: 'Giao diện', description: 'Tên app, màu chủ đề, font, cỡ chữ và ảnh nền.', Component: AppearanceSettings },
  { value: 'languages', label: 'Ngôn ngữ', description: 'Các lựa chọn trong ô Ngôn ngữ khi thêm hoặc sửa sách.', Component: LanguageSettings },
  { value: 'data', label: 'Dữ liệu', description: 'Mật khẩu và nút xoá toàn bộ dữ liệu của app.', Component: DataSettings },
  { value: 'storage', label: 'Lưu trữ', nodeOnly: true, description: 'Nơi lưu database, ảnh và file đính kèm, ví dụ một thư mục trong Google Drive.', Component: StorageSettings },
];

const TABS = ALL_TABS.filter((entry) => !(IS_PWA && entry.nodeOnly));

export function SettingsPage() {
  const { tab = TABS[0].value } = useParams();
  const navigate = useNavigate();
  const active = TABS.find((entry) => entry.value === tab) ?? TABS[0];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl">Cài đặt</h1>
      <Tabs.Root value={active.value} onValueChange={(value) => navigate(`/settings/${value}`)}>
        <Tabs.List className="flex gap-1 border-b border-line" aria-label="Mục cài đặt">
          {TABS.map((entry) => (
            <Tabs.Trigger
              key={entry.value}
              value={entry.value}
              className="-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:border-moss data-[state=active]:text-ink"
            >
              {entry.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {TABS.map(({ value, description, Component }) => (
          <Tabs.Content key={value} value={value} className="pt-6 focus:outline-none">
            <p className="mb-6 text-ink-muted">{description}</p>
            <Component />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
