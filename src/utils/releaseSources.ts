/**
 * Known anime / movie release sources, fansub groups, and torrent tags
 * that appear in filenames — used by local parser + mediaHints + AI prompt.
 *
 * These are filename tokens only (prefixes, [brackets], -GROUP tails).
 * Not an endorsement of any site; just what users' libraries actually contain.
 */

/** Anime streaming / fansub sites & groups (filename prefixes or tags). */
export const ANIME_SOURCES = [
  // Platforms / indexes
  'AnimePahe',
  'Anime-Time',
  'AnimeTime',
  'TokyoTosho',
  'AnimeTosho',
  'AniDL',
  'AniLibria',
  'Nyaa',
  'AniList',
  // Fansub / encode groups
  'SubsPlease',
  'Erai-raws',
  'EraiRaws',
  'HorribleSubs',
  'Horriblesubs',
  'GJM',
  'Commie',
  'GHOST',
  'FFF',
  'Underwater',
  'Yameii',
  'CRUCiBLE',
  'Freehold',
  'Judas',
  'ASW',
  'DKB',
  'MTBB',
  'Dae',
  'FLE',
  'smol',
  'TaigaSubs',
  'NanakoRaws',
  'Tsundere-Rips',
  'TsundereRips',
  'EMBER',
  'CameEsp',
  'LoliHouse',
  'ANi',
  'Ohys-Raws',
  'OhysRaws',
  'Leopard-Raws',
  'LeopardRaws',
  'Exiled-Destiny',
  'Doki',
  'Vivid',
  'Mixed-Subs',
  'HR-GZ',
  'CBM',
  'Kaleido',
  'Arid',
  'LostYears',
  'Spectre',
  'Afro',
  'Asenshi',
  'Chyuu',
  'DameDesuYo',
  'DeadFish',
  'DragsterPS',
  'Final8',
  'GSK_kun',
  'Hashenshi',
  'Kaleido-subs',
  'Moozzi2',
  'Nekomoe',
  'Nyanpasu',
  'Orphan',
  'PuyaSubs',
  'ReinForce',
  'SaiyaGami',
  'Seto-Otaku',
  'Some-Stuffs',
  'THORA',
  'UTW',
  'Vodes',
  'WRAITH',
  'Zurako',
  '9volt',
  'Kawaiika',
  'Yamashiro',
] as const;

/** Live-action / movie / Western TV release sites & scene/P2P groups. */
export const MOVIE_SOURCES = [
  // Public torrent brands / sites (often in [brackets] or www.)
  'YTS',
  'YTS.MX',
  'YTS.AM',
  'YTS.LT',
  'YIFY',
  'RARBG',
  'RARBG.com',
  '1337x',
  'TGx',
  'TorrentGalaxy',
  'ETTV',
  'EZTV',
  'FGT',
  'EVO',
  'FLUX',
  'SPARKS',
  'GECKOS',
  'BONE',
  'CMRG',
  'RMTeam',
  'NTb',
  'MiNX',
  'QOQ',
  'MeGusta',
  'Tigole',
  'QxR',
  'D-Z0N3',
  'ION10',
  'Joy',
  'PSA', // also does anime encodes
  'GalaxyRG',
  'GalaxyTV',
  'RMX',
  'HONE',
  'SuccessfulCrab',
  'XEBEC',
  'FLUX',
  'AMZN',
  'NF',
  'DSNP',
  'ATVP',
  'HMAX',
  'iT',
  'PCOK',
  'PMTP',
  // Scene-style
  'DIMENSION',
  'KILLERS',
  'LOL',
  'ASAP',
  '2HD',
  'FUM',
  'NTb',
  'CtrlHD',
  'DON',
  'TEPES',
  'W4F',
  'TOMMY',
  'SiCFoI',
  // Regional / DDL-style tags users often keep in names
  'NaijaPrey',
  'NetNaija',
  'FZMovies',
  'O2TvSeries',
  'MovieBox',
  'Mkvcinema',
  '9xMovies',
  '1TamilMV',
  'TamilRockers',
  'Bollywood',
  'HDHub4u',
  'MoviesMod',
  'KatMovieHD',
] as const;

/** Tokens that are never part of a clean title. */
export const JUNK_TOKENS = [
  'Eng', 'English', 'Dub', 'Dubbed', 'Sub', 'Subbed', 'Dual', 'Multi', 'Audio',
  'BD', 'BDrip', 'BluRay', 'Blu-Ray', 'WEB-DL', 'WEBDL', 'WEBRip', 'HDTV', 'DVDRip',
  'BRRip', 'HDRip', 'CAM', 'TS', 'TC', 'SCR', 'R5',
  'x264', 'x265', 'h264', 'h265', 'HEVC', 'AVC', 'AV1', 'XviD', 'DivX',
  'AAC', 'DTS', 'AC3', 'DD5.1', 'DDP5.1', 'TrueHD', 'Atmos', 'FLAC', 'MP3',
  '10bit', '8bit', 'HDR', 'HDR10', 'HDR10+', 'DV', 'Dolby', 'Vision', 'Hi10P', 'Hi10p',
  'Proper', 'REPACK', 'INTERNAL', 'iNTERNAL', 'LIMITED', 'EXTENDED', 'UNRATED',
  'Directors', 'Cut', 'Remastered', 'IMAX', 'HC', 'HDTS',
  'BATCH', 'COMPLETE', 'Sample', 'Trailer',
  'NF', 'AMZN', 'DSNP', 'HMAX', 'ATVP', 'HULU', 'PCOK', 'PMTP',
] as const;

/** Build a case-insensitive alternation for regex from string lists. */
export function alt(list: readonly string[]): string {
  return list
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|');
}

/** Compact list for the AI system prompt (names only). */
export function sourcesForPrompt(): string {
  const anime = ANIME_SOURCES.slice(0, 40).join(', ');
  const movie = MOVIE_SOURCES.slice(0, 45).join(', ');
  return `Anime sources/groups: ${anime}, …\nMovie/P2P sources/groups: ${movie}, …`;
}
