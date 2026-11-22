import { createDashboardService } from './dashboardService.js';
import { createImageService } from './imageService.js';
import { createImportService } from './import/importService.js';
import { createMarkdownImport } from './import/markdownImport.js';
import { createFunService } from './funService.js';
import { createGoalsService } from './goalsService.js';
import { createItemService } from './itemService.js';
import { createLibraryCardService } from './libraryCardService.js';
import { createReadingLogService } from './readingLogService.js';
import { createReadingNoteService } from './readingNoteService.js';
import { createQuoteService } from './quoteService.js';
import { createTemplateService } from './obsidian/templates/templateService.js';
import { createReadingsService } from './readingsService.js';
import { createSeriesService } from './seriesService.js';
import { createDataService } from './dataService.js';
import { createDriveSyncService } from './driveSync/index.js';
import { createSettingsService } from './settingsService.js';
import { createStatsService } from './statsService.js';
import { createSyncConfigService } from './syncConfigService.js';

export function createServices(context) {
  return {
    items: createItemService(context),
    libraryCards: createLibraryCardService(context),
    readingNotes: createReadingNoteService(context),
    readingLogs: createReadingLogService(context),
    quotes: createQuoteService(context),
    syncConfig: createSyncConfigService(context),
    templates: createTemplateService(context),
    importer: createImportService(context),
    markdownImport: createMarkdownImport(context),
    images: createImageService(context),
    settings: createSettingsService(context),
    dashboard: createDashboardService(context),
    readings: createReadingsService(context),
    stats: createStatsService(context),
    goals: createGoalsService(context),
    fun: createFunService(context),
    series: createSeriesService(context),
    data: createDataService(context),
    driveSync: createDriveSyncService(context),
  };
}
