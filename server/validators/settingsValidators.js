import { z } from 'zod';
import { STATUSES } from './common.js';

export const PRESETS = ['moss', 'ocean', 'rose', 'lavender', 'slate'];
export const DISPLAY_FONTS = ['fraunces', 'lora', 'playfair', 'noto-serif', 'be-vietnam-pro'];
export const ORNAMENT_SIZES = ['sm', 'md', 'lg'];
// Theme tự tạo: 7 màu chính cho mỗi chế độ; các màu còn lại client tự suy ra.
export const THEME_COLOR_KEYS = ['paper', 'surface', 'ink', 'moss', 'sage', 'honey', 'walnut'];
const CUSTOM_THEME_ID = /^custom-[a-z0-9]{4,24}$/;
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Màu phải ở dạng #RRGGBB');
const palette = z.object(Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, hexColor]))).strict();
export const BODY_FONTS = ['be-vietnam-pro', 'inter', 'nunito', 'lexend', 'noto-serif'];

export const updateSettingsSchema = z
  .object({
    general: z
      .object({
        app_name: z.string().trim().min(1, 'Tên app không được trống').max(40, 'Tên app tối đa 40 ký tự'),
        // Ngôn ngữ giao diện: vi (thuần Việt), en, zh, ja.
        ui_language: z.enum(['vi', 'en', 'zh', 'ja']),
      })
      .partial()
      .optional(),
    languages: z
      .array(z.string().trim().min(1, 'Tên ngôn ngữ không được trống').max(60))
      .max(100)
      .refine((list) => new Set(list.map((entry) => entry.toLowerCase())).size === list.length, 'Danh sách có ngôn ngữ bị trùng')
      .optional(),
    appearance: z
      .object({
        preset: z.union([z.enum(PRESETS), z.string().regex(CUSTOM_THEME_ID, 'Theme không hợp lệ')]),
        accent: z.string().regex(/^#[0-9a-f]{6}$/i, 'Màu phải ở dạng #RRGGBB').nullable(),
        display_font: z.enum(DISPLAY_FONTS),
        body_font: z.enum(BODY_FONTS),
        font_size: z.number().int().min(13).max(20),
        background_opacity: z.number().min(0).max(1),
      })
      .partial()
      .optional(),
    status_aliases: z.record(z.string().trim().min(1).max(200), z.enum(STATUSES)).optional(),
    // Kho fandom & cặp đôi: gợi ý pairing theo fandom trong form sửa fanfic.
    fandom_library: z
      .array(
        z
          .object({
            fandom: z.string().trim().min(1, 'Cần tên fandom').max(200),
            pairings: z.array(z.string().trim().min(1).max(200)).max(1000),
          })
          .strict(),
      )
      .max(2000)
      .refine((list) => new Set(list.map((entry) => entry.fandom.toLowerCase())).size === list.length, 'Có fandom bị trùng tên')
      .optional(),
    themes: z
      .array(z.object({ id: z.string().regex(CUSTOM_THEME_ID), name: z.string().trim().min(1, 'Cần tên theme').max(40, 'Tên theme tối đa 40 ký tự'), light: palette, dark: palette }).strict())
      .max(30, 'Tối đa 30 theme')
      .refine((list) => new Set(list.map((entry) => entry.id)).size === list.length, 'Trùng id theme')
      .optional(),
    // Đồ trang trí kệ: chỉ sửa thông tin hiển thị; file chỉ thêm/xoá qua API riêng.
    ornaments: z
      .object({
        enabled: z.boolean(),
        per_shelf: z.number().int().min(0).max(6),
        items: z
          .array(
            z
              .object({
                id: z.string().regex(/^[a-z0-9-]{1,40}$/),
                name: z.string().trim().max(80),
                enabled: z.boolean(),
                size: z.enum(ORNAMENT_SIZES),
              })
              .strict(),
          )
          .max(200),
      })
      .partial()
      .optional(),
  })
  .refine((value) => value.languages || value.appearance || value.general || value.status_aliases || value.ornaments || value.themes || value.fandom_library, 'Cần ít nhất một nhóm cài đặt');
