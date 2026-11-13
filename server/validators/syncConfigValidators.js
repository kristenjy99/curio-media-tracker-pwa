import path from 'node:path';
import { z } from 'zod';
import { MAIN_CATEGORIES, requireAtLeastOneField } from './common.js';

const vaultSubfolder = z
  .string()
  .trim()
  .max(200)
  .transform((value) => value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
  .refine((value) => !path.isAbsolute(value) && !/^[a-zA-Z]:/.test(value), 'vault_subfolder phải là đường dẫn tương đối trong vault')
  .refine(
    (value) => value.split('/').every((segment) => segment !== '..' && !segment.startsWith('.')),
    'vault_subfolder không được chứa ".." hoặc thư mục ẩn',
  );

export const updateSyncConfigSchema = requireAtLeastOneField(
  z.object({
    vault_path: z
      .string()
      .trim()
      .min(1)
      .max(4096)
      .refine((value) => path.isAbsolute(value), 'vault_path phải là đường dẫn tuyệt đối')
      .nullable()
      .optional(),
    vault_subfolder: vaultSubfolder.optional(),
    // Thư mục note media, tính từ gốc vault; rỗng = không sync media.
    media_subfolder: vaultSubfolder.optional(),
    sync_enabled: z.boolean().optional(),
    sync_direction: z.enum(['app_to_obsidian', 'two_way']).optional(),
    category_folders: z.boolean().optional(),
    folder_names: z
      .partialRecord(
        z.enum(MAIN_CATEGORIES),
        z
          .string()
          .trim()
          .min(1, 'Tên thư mục không được trống')
          .max(80)
          .refine((value) => !/[\\/:*?"<>|]/.test(value) && !value.startsWith('.') && !/[. ]$/.test(value), 'Tên thư mục không được chứa \\ / : * ? " < > |, không bắt đầu bằng dấu chấm'),
      )
      .refine((value) => new Set(Object.values(value).map((name) => name.toLowerCase())).size === Object.values(value).length, 'Hai thể loại không được dùng chung một thư mục')
      .optional(),
  }),
);

export const runSyncQuerySchema = z.object({
  dry_run: z
    .enum(['true', 'false', '1', '0'])
    .transform((value) => value === 'true' || value === '1')
    .optional(),
});
