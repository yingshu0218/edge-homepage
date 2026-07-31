import { describe, expect, it, vi } from 'vitest';
import { createBigDataCloudReverseGeocodeClient } from './reverseGeocodeClient';

describe('BigDataCloud reverse geocoder', () => {
  it('requests the current coordinates in Chinese and prefers city', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      city: '福州市',
      locality: '鼓楼区',
      principalSubdivision: '福建省',
      countryName: '中国',
    }), { status: 200 }));
    const client = createBigDataCloudReverseGeocodeClient(fetchFn);

    await expect(client.reverse(26.08044, 119.30049)).resolves.toEqual({
      name: '福州市',
      admin: '福建省',
      country: '中国',
    });
    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(`${url.origin}${url.pathname}`).toBe('https://api.bigdatacloud.net/data/reverse-geocode-client');
    expect(url.searchParams.get('latitude')).toBe('26.08044');
    expect(url.searchParams.get('longitude')).toBe('119.30049');
    expect(url.searchParams.get('localityLanguage')).toBe('zh');
  });

  it.each([
    [{ city: '', locality: '鼓楼区', principalSubdivision: '福建省', countryName: '中国' }, '鼓楼区'],
    [{ city: '', locality: '', principalSubdivision: '福建省', countryName: '中国' }, '福建省'],
    [{ city: '', locality: '', principalSubdivision: '', countryName: '中国' }, '中国'],
  ])('uses the first available readable locality from %o', async (body, name) => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(createBigDataCloudReverseGeocodeClient(fetchFn).reverse(26, 119))
      .resolves.toMatchObject({ name });
  });

  it('rejects a payload without any readable place', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(createBigDataCloudReverseGeocodeClient(fetchFn).reverse(26, 119))
      .rejects.toThrow('暂时无法解析所在城市');
  });

  it('rejects malformed response payloads', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    await expect(createBigDataCloudReverseGeocodeClient(fetchFn).reverse(26, 119))
      .rejects.toThrow('暂时无法解析所在城市');
  });

  it('normalizes HTTP errors to the location-resolution error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(createBigDataCloudReverseGeocodeClient(fetchFn).reverse(26, 119))
      .rejects.toThrow('暂时无法解析所在城市');
  });

  it('propagates abort errors', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    const fetchFn = vi.fn().mockRejectedValue(abortError);
    const controller = new AbortController();

    await expect(createBigDataCloudReverseGeocodeClient(fetchFn).reverse(26, 119, controller.signal))
      .rejects.toBe(abortError);
    expect(fetchFn).toHaveBeenCalledWith(expect.any(URL), { signal: controller.signal });
  });
});
