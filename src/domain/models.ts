export type Bookmark = {
  id: string;
  title: string;
  url: string;
  groupId: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type BookmarkGroup = {
  id: string;
  name: string;
  order: number;
  updatedAt: number;
  deletedAt?: number;
};

export type AppSettings = {
  searchTemplate: string;
  themeId: string;
  appearance: 'light' | 'dark';
  overlay: number;
  blur: number;
  useCustomBackground: boolean;
  updatedAt: number;
};

export type AppSnapshot = {
  schemaVersion: 1;
  bookmarks: Bookmark[];
  groups: BookmarkGroup[];
  settings: AppSettings;
};
