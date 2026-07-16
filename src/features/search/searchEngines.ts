export type SearchEngine = {
  id: string;
  name: string;
  template: string;
};

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', template: 'https://www.baidu.com/s?wd=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  { id: 'brave', name: 'Brave', template: 'https://search.brave.com/search?q=%s' },
  { id: 'sogou', name: '搜狗', template: 'https://www.sogou.com/web?query=%s' },
  { id: 'so360', name: '360 搜索', template: 'https://www.so.com/s?q=%s' },
];

export function findSearchEngine(template: string) {
  return SEARCH_ENGINES.find((engine) => engine.template === template);
}
