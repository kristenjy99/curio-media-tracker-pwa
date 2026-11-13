import { z } from 'zod';
import { isoDate, optionalText, rating, requireAtLeastOneField } from './common.js';

const cardFields = z.object({
  start_date: isoDate.nullable(),
  finish_date: isoDate.nullable(),
  finish_year: z.number().int().min(1900).max(2100).nullable(),
  rating: rating.nullable(),
  review_summary: optionalText(5000),
});

const finishAfterStart = (card) => !card.start_date || !card.finish_date || card.finish_date >= card.start_date;
const finishAfterStartMessage = { message: 'finish_date phải sau hoặc bằng start_date', path: ['finish_date'] };

export const createLibraryCardSchema = cardFields.partial().refine(finishAfterStart, finishAfterStartMessage);

export const updateLibraryCardSchema = requireAtLeastOneField(cardFields.partial()).refine(
  finishAfterStart,
  finishAfterStartMessage,
);

export { finishAfterStart };
