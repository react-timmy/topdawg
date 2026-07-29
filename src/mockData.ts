import { MediaItem, LocalFile } from './types';

export const mockMediaItem: MediaItem = {
  id: '550',
  title: 'Fight Club',
  type: 'movie',
  description:
    'A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.',
  posterUrl: 'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/hZkgoQYus5vegHoetLkCJzVCDMH.jpg',
  rating: 8.4,
  releaseDate: '1999-10-15',
  runtime: 139,
  genres: ['Drama', 'Thriller'],
};

export const mockLocalFile: LocalFile = {
  uri: 'file:///storage/emulated/0/Movies/Fight.Club.1999.1080p.mkv',
  filename: 'Fight.Club.1999.1080p.mkv',
  duration: 8340,
};
