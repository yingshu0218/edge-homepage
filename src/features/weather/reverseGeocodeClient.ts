import type { ReverseGeocodeClient } from './types';

const ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

function readable(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function createBigDataCloudReverseGeocodeClient(
  fetchFn: typeof fetch = fetch,
): ReverseGeocodeClient {
  return {
    async reverse(latitude, longitude, signal) {
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('无效的位置坐标');
      }
      const url = new URL(ENDPOINT);
      url.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        localityLanguage: 'zh',
      }).toString();
      try {
        const response = await fetchFn(url, signal ? { signal } : undefined);
        if (!response.ok) throw new Error(`reverse geocode HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('invalid payload');
        const value = body as Record<string, unknown>;
        const country = readable(value.countryName);
        const admin = readable(value.principalSubdivision);
        const name = readable(value.city) ?? readable(value.locality) ?? admin ?? country;
        if (!name || !country) throw new Error('missing place');
        return { name, ...(admin && admin !== name ? { admin } : {}), country };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new Error('暂时无法解析所在城市');
      }
    },
  };
}
