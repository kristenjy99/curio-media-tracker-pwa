/**
 * Template mặc định dựng từ 3 note mẫu của người dùng (Howl's Moving Castle, Tiếng lòng lặng thinh,
 * How to Take Smart Notes). Visual/Comics dựng từ mẫu Fiction và thêm số volume.
 *
 * Mỗi property: key (tên trong Obsidian), field (trường app hoặc custom:<slug>), format,
 * link (bọc [[...]]), list (luôn ghi dạng danh sách).
 * Property "rt_id" do hệ thống tự thêm ở đầu file, không nằm trong danh sách này.
 */
const p = (key, field, format = 'text', { link = false, list = false } = {}) => ({ key, field, format, link, list });
const linkList = { link: true, list: true };
const link = { link: true };

const FICTION_BODY = `## 🔖 Book Summary


## 🔖 Book Review


## ✨Overview:
**(theme, genre, first feeling, mood board, keywords)**


## ✨Plot:
**(storyline, development, pacing, specific moments, ending, plot holes, worldbuilding)**


## ✨Characters:
**(main and favorite characters - development, personality, why like, ending)**


## ✨Prose:
**(author’s + translator’s writing style)**


# ☀️Highlights:


# 🎇 Quotes:

`;

const FANFICTION_BODY = `Link fic gốc:

## 🔖 Fanfic Summary


## 🔖 Fanfic Review


## 🎇 Quotes:

`;

const NONFICTION_BODY = `# 🔖 Book Summary
Topic:


# 🔖 Book Notes

## ✨Overview:

**(brief overview of the book's subjects/topics matter and purpose -> reasons to read)**


## ✨Chapter :

### Introduction:
**(main topic/idea)**

## 🗝️ Analysis:
### Key points:
**(key points, ideas, arguments covered/discussed in the chapter)**


### Supporting evidences:
**(provide example, case studies -> analyze or data to support the key points => thoughts on them)**


### Summary:
**(summarize the main take away from this chapter)**


### Self-reflection/relevant:


## ✨Conclusion:

### Summary of key findings:
**(summarize the main finding/insights presented throughout the books)**


### Final thoughts:
**(offer any conclusion thoughts or recommendation)**


### Call to actions:
**(suggest action/next steps/solutions based on the books' contents)**


#  🔎 further research:


# 🌻 Highlights:

`;

export const DEFAULT_TEMPLATES = {
  Fiction: {
    properties: [
      p('Category', 'main_category'),
      p('Author', 'creator_author', 'text', linkList),
      p('Series', 'custom:series', 'text', linkList),
      p('Genres', 'tags', 'text', linkList),
      p('Status', 'status', 'text', linkList),
      p('Rating', 'rating', 'stars', link),
      p('Published', 'release_year', 'number'),
      p('Format', 'format', 'text', link),
      p('Year', 'read_years', 'number', linkList),
      p('Date started', 'latest_start_date', 'date'),
      p('Date finished', 'latest_finish_date', 'date'),
      p('Reads', 'reads', 'reads'),
      p('Favorite?', 'is_favorite', 'checkbox'),
      p('Cover', 'cover_image'),
      p('Review date', 'review_date', 'date'),
    ],
    body_template: FICTION_BODY,
  },
  Fanfiction: {
    properties: [
      p('Category', 'main_category'),
      p('Author', 'creator_author', 'text', linkList),
      p('Status', 'status', 'text', link),
      p('FIN?', 'custom:completion', 'text', link),
      p('Genres', 'tags', 'text', linkList),
      p('Series, PJ', 'custom:series', 'text', linkList),
      p('Fandom', 'fandoms', 'text', link),
      p('Chapters', 'total_units', 'number'),
      p('Words', 'word_count', 'number'),
      p('Ratings', 'rating', 'stars', linkList),
      p('Year', 'read_years', 'number', linkList),
      p('Date started', 'latest_start_date', 'date'),
      p('Date finished', 'latest_finish_date', 'date'),
      p('Reads', 'reads', 'reads'),
      p('Ships', 'pairings', 'text', linkList),
      p('Platform', 'format', 'text', link),
      p('Language', 'language', 'text', linkList),
      p('Link', 'custom:link'),
      p('CoverUrl', 'cover_image'),
    ],
    body_template: FANFICTION_BODY,
  },
  Nonfiction: {
    properties: [
      p('Category', 'main_category'),
      p('Author', 'creator_author', 'text', linkList),
      p('Date started', 'latest_start_date', 'date'),
      p('Date finished', 'latest_finish_date', 'date'),
      p('Reads', 'reads', 'reads'),
      p('Review date', 'review_date', 'date'),
      p('Status', 'status', 'text', linkList),
      p('Series', 'custom:series', 'text', linkList),
      p('Genres', 'tags', 'text', linkList),
      p('Language', 'language', 'text', linkList),
      p('Rating', 'rating', 'stars', link),
      p('Published', 'release_year', 'number'),
      p('Format', 'format', 'text', link),
      p('Year', 'read_years', 'number', linkList),
      p('Favorite?', 'is_favorite', 'checkbox'),
      p('Cover', 'cover_image'),
    ],
    body_template: NONFICTION_BODY,
  },
  'Visual/Comics': {
    properties: [
      p('Category', 'main_category'),
      p('Author', 'creator_author', 'text', linkList),
      p('Series', 'custom:series', 'text', linkList),
      p('Genres', 'tags', 'text', linkList),
      p('Type', 'media_type', 'text', link),
      p('Status', 'status', 'text', linkList),
      p('Rating', 'rating', 'stars', link),
      p('Published', 'release_year', 'number'),
      p('Volumes', 'volume_count', 'number'),
      p('Format', 'format', 'text', link),
      p('Year', 'read_years', 'number', linkList),
      p('Date started', 'latest_start_date', 'date'),
      p('Date finished', 'latest_finish_date', 'date'),
      p('Reads', 'reads', 'reads'),
      p('Favorite?', 'is_favorite', 'checkbox'),
      p('Cover', 'cover_image'),
      p('Review date', 'review_date', 'date'),
    ],
    body_template: FICTION_BODY,
  },
};
