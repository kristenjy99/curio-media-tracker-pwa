import { createItemModel } from './itemModel.js';
import { createLibraryCardModel } from './libraryCardModel.js';
import { createReadingLogModel } from './readingLogModel.js';
import { createReadingNoteModel } from './readingNoteModel.js';
import { createQuoteModel } from './quoteModel.js';
import { createSyncConfigModel } from './syncConfigModel.js';
import { createSyncTombstoneModel } from './syncTombstoneModel.js';
import { createTemplateModel } from './templateModel.js';

export function createModels(db) {
  return {
    items: createItemModel(db),
    libraryCards: createLibraryCardModel(db),
    readingNotes: createReadingNoteModel(db),
    readingLogs: createReadingLogModel(db),
    quotes: createQuoteModel(db),
    syncConfig: createSyncConfigModel(db),
    syncTombstones: createSyncTombstoneModel(db),
    templates: createTemplateModel(db),
  };
}
