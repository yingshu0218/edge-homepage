import type { AppSnapshot } from './models';

const INITIAL_TIMESTAMP = 0;
const DEVELOPMENT_GROUP_ID = 'development';

export function createDefaultSnapshot(): AppSnapshot {
  return {
    schemaVersion: 3,
    bookmarkUsage: {},
    groups: [
      {
        id: DEVELOPMENT_GROUP_ID,
        name: '开发',
        order: 0,
        updatedAt: INITIAL_TIMESTAMP,
      },
    ],
    bookmarks: [
      {
        id: 'github',
        title: 'GitHub',
        url: 'https://github.com/',
        groupId: DEVELOPMENT_GROUP_ID,
        order: 0,
        createdAt: INITIAL_TIMESTAMP,
        updatedAt: INITIAL_TIMESTAMP,
      },
      {
        id: 'mdn',
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org/',
        groupId: DEVELOPMENT_GROUP_ID,
        order: 1,
        createdAt: INITIAL_TIMESTAMP,
        updatedAt: INITIAL_TIMESTAMP,
      },
      {
        id: 'stackoverflow',
        title: 'Stack Overflow',
        url: 'https://stackoverflow.com/',
        groupId: DEVELOPMENT_GROUP_ID,
        order: 2,
        createdAt: INITIAL_TIMESTAMP,
        updatedAt: INITIAL_TIMESTAMP,
      },
      {
        id: 'npm',
        title: 'npm',
        url: 'https://www.npmjs.com/',
        groupId: DEVELOPMENT_GROUP_ID,
        order: 3,
        createdAt: INITIAL_TIMESTAMP,
        updatedAt: INITIAL_TIMESTAMP,
      },
    ],
    settings: {
      searchTemplate: 'https://www.google.com/search?q=%s',
      themeId: 'aurora',
      appearance: 'dark',
      overlay: 0.38,
      blur: 0,
      useCustomBackground: false,
      bookmarkDisplayLimit: 8,
      clockHour12: false,
      clockShowSeconds: false,
      clockShowFullDate: true,
      temperatureUnit: 'celsius',
      updatedAt: INITIAL_TIMESTAMP,
    },
  };
}
