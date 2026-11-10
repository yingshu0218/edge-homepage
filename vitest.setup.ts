import '@testing-library/jest-dom/vitest';

// Vitest 3 keeps existing Node globals. Bind browser storage to this environment's
// jsdom window instead of Node's server-side localStorage (which needs a file).
const browserWindow = (globalThis as typeof globalThis & { jsdom: { window: Window } }).jsdom.window;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: browserWindow.localStorage });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: browserWindow.sessionStorage });
