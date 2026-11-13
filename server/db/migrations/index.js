import initialSchema from './001_initial_schema.js';
import obsidianSync from './002_obsidian_sync.js';
import obsidianTemplates from './003_templates.js';
import imagesYearReads from './004_images_year_reads.js';
import reviewDateSettings from './005_review_date_settings.js';
import categoryFolders from './006_category_folders.js';
import noteMediaLogs from './007_note_media_logs.js';
import warnings from './008_warnings.js';
import goalsReadingsFun from './009_goals_readings_fun.js';
import importIssues from './010_import_issues.js';
import newsPaperMedia from './011_news_paper_media.js';
import seriesPositions from './012_series_positions.js';
import mediaSyncFolder from './013_media_sync_folder.js';
import spiceRating from './014_spice_rating.js';
import syncIdentity from './015_sync_identity.js';

// Thêm migration mới vào cuối mảng, version tăng dần, không sửa migration đã chạy.
export const migrations = [initialSchema, obsidianSync, obsidianTemplates, imagesYearReads, reviewDateSettings, categoryFolders, noteMediaLogs, warnings, goalsReadingsFun, importIssues, newsPaperMedia, seriesPositions, mediaSyncFolder, spiceRating, syncIdentity];
