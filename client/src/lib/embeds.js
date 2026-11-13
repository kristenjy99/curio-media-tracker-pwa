/** Nhận dạng link playlist và dựng URL nhúng (iframe). Chỉ nhúng các nền tảng có trình phát chính thức. */

export const PLATFORM_LABELS = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  apple_music: 'Apple Music',
  soundcloud: 'SoundCloud',
  other: 'Link',
};

export function detectPlatform(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (host === 'open.spotify.com' || host.endsWith('.spotify.com') || host === 'spotify.link') return 'spotify';
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) return 'youtube';
  if (host === 'music.apple.com') return 'apple_music';
  if (host.endsWith('soundcloud.com')) return 'soundcloud';
  return 'other';
}

const SPOTIFY_PATH = /^\/(?:intl-[a-z-]+\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

function youtubeEmbed(url) {
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const list = url.searchParams.get('list');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else {
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
    if (match) id = match[1];
  }
  const params = new URLSearchParams();
  if (list && YOUTUBE_ID.test(list.replace(/[^A-Za-z0-9_-]/g, '')) && /^[A-Za-z0-9_-]+$/.test(list)) params.set('list', list);
  if (id && YOUTUBE_ID.test(id)) return `https://www.youtube-nocookie.com/embed/${id}${params.size ? `?${params}` : ''}`;
  if (params.has('list')) return `https://www.youtube-nocookie.com/embed/videoseries?${params}`;
  return null;
}

/** { src, height, aspect } để dựng iframe, hoặc null nếu link không nhúng được (chỉ mở tab mới). */
export function embedFor(link) {
  let url;
  try {
    url = new URL(link.url);
  } catch {
    return null;
  }
  const platform = link.platform ?? detectPlatform(link.url);
  if (platform === 'spotify') {
    const match = url.pathname.match(SPOTIFY_PATH);
    if (!match) return null;
    const tall = ['playlist', 'album', 'artist', 'show'].includes(match[1]);
    return { src: `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator`, height: tall ? 352 : 152 };
  }
  if (platform === 'youtube') {
    const src = youtubeEmbed(url);
    return src ? { src, aspect: '16 / 9' } : null;
  }
  if (platform === 'apple_music') {
    return { src: `https://embed.music.apple.com${url.pathname}${url.search}`, height: url.pathname.includes('/song/') ? 175 : 450 };
  }
  if (platform === 'soundcloud') {
    return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(link.url)}&visual=false`, height: 166 };
  }
  return null;
}
