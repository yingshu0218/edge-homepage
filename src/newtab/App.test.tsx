import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import type { SyncState } from '../sync/types';
import { App, type AppServices } from './App';
import { exportSnapshot } from '../storage/transfer';
import { EdgeSyncProvider } from '../sync/edgeSyncProvider';
import { SyncCoordinator } from '../sync/syncCoordinator';

afterEach(cleanup);

function fakeServices(snapshot: AppSnapshot, load?: () => Promise<AppSnapshot>): AppServices {
  return {
    repository: {
      load: load ?? vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    },
    coordinator: {
      saveAndSync: vi.fn().mockResolvedValue({ kind: 'synced', at: 1 } satisfies SyncState),
    },
    sync: {
      pull: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    },
    backgrounds: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    navigate: vi.fn(),
    download: vi.fn(),
    now: () => 1_752_636_060_000,
    createId: () => 'docs',
  };
}

describe('new tab application', () => {
  it('shows a loading shell until the local snapshot resolves', async () => {
    let resolve!: (snapshot: AppSnapshot) => void;
    const services = fakeServices(createDefaultSnapshot(), () => new Promise((done) => { resolve = done; }));
    render(<App services={services} />);

    expect(screen.getByRole('status')).toHaveTextContent('正在准备启动页');
    resolve(createDefaultSnapshot());
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
  });

  it('loads the snapshot and persists an added bookmark', async () => {
    const services = fakeServices(createDefaultSnapshot());
    render(<App services={services} />);
    await screen.findByText('GitHub');

    fireEvent.click(screen.getByRole('button', { name: '添加书签' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Docs' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com/docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }));

    await screen.findByText('Docs');
    await waitFor(() => expect(services.coordinator.saveAndSync).toHaveBeenCalledOnce());
    expect(services.coordinator.saveAndSync).toHaveBeenCalledWith(expect.objectContaining({
      bookmarks: expect.arrayContaining([expect.objectContaining({ id: 'docs', title: 'Docs' })]),
    }));
  });

  it('hydrates a fresh device from the Edge sync snapshot', async () => {
    const local = createDefaultSnapshot();
    const remote = createDefaultSnapshot();
    remote.bookmarks = [...remote.bookmarks, {
      id: 'synced-docs', title: 'Synced Docs', url: 'https://example.com/', groupId: 'development',
      order: 4, createdAt: 2, updatedAt: 2,
    }];
    const services = fakeServices(local);
    services.sync.pull = vi.fn().mockResolvedValue(remote);

    render(<App services={services} />);

    expect(await screen.findByText('Synced Docs')).toBeInTheDocument();
    expect(services.repository.save).toHaveBeenCalledWith(expect.objectContaining({
      bookmarks: expect.arrayContaining([expect.objectContaining({ id: 'synced-docs' })]),
    }));
  });

  it('keeps the hydrated page usable when saving the merged snapshot fails', async () => {
    const remote = createDefaultSnapshot();
    remote.bookmarks.push({ ...remote.bookmarks[0]!, id: 'remote', title: 'Remote', order: 4, updatedAt: 2 });
    const services = fakeServices(createDefaultSnapshot());
    services.sync.pull = vi.fn().mockResolvedValue(remote);
    services.repository.save = vi.fn().mockRejectedValue(new Error('hydration save failed'));

    render(<App services={services} />);

    expect(await screen.findByText('Remote')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('status').some((node) => node.textContent?.includes('hydration save failed'))).toBe(true));
  });

  it('keeps the local start page usable when the Edge pull is unavailable', async () => {
    const services = fakeServices(createDefaultSnapshot());
    services.sync.pull = vi.fn().mockRejectedValue(new Error('Edge sync unavailable'));
    render(<App services={services} />);

    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(screen.getAllByRole('status').some((status) => /同步失败/.test(status.textContent ?? ''))).toBe(true);
  });

  it('does not show a green success fact while sync is local or failed', async () => {
    const services = fakeServices(createDefaultSnapshot());
    services.sync.pull = vi.fn().mockRejectedValue(new Error('corrupt remote'));
    render(<App services={services} />);
    await screen.findByText('GitHub');
    expect(screen.queryByLabelText('Microsoft 已同步')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Microsoft 同步异常')).toBeInTheDocument();
  });

  it('shows factual pending and warning indicators without a green check', async () => {
    const services = fakeServices(createDefaultSnapshot());
    let resolve!: (state: SyncState) => void;
    services.coordinator.saveAndSync = vi.fn(() => new Promise<SyncState>((done) => { resolve = done; }));
    render(<App services={services} />);
    await screen.findByText('GitHub');
    expect(screen.getByLabelText('Microsoft 仅本地')).toHaveTextContent('•');
    fireEvent.click(screen.getByRole('button', { name: '添加书签' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Docs' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com/docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }));
    expect(await screen.findByLabelText('Microsoft 正在同步')).toHaveTextContent('…');
    resolve({ kind: 'warning', bytes: 93 * 1024 });
    expect(await screen.findByLabelText('Microsoft 同步警告')).toHaveTextContent('!');
    expect(screen.queryByLabelText('Microsoft 已同步')).not.toBeInTheDocument();
  });

  it('keeps local data and offers recovery when remote chunks are corrupt', async () => {
    const services = fakeServices(createDefaultSnapshot());
    services.sync.pull = vi.fn().mockRejectedValue(new Error('Corrupted Edge sync data: invalid snapshot structure'));
    render(<App services={services} />);
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(services.repository.save).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '重置同步数据' })).toBeInTheDocument();
  });

  it('warns and falls back when a selected custom background is missing locally', async () => {
    const snapshot = createDefaultSnapshot(); snapshot.settings.useCustomBackground = true;
    render(<App services={fakeServices(snapshot)} />);
    expect(await screen.findByRole('status', { name: '背景回退提示' })).toHaveTextContent('自定义背景仅保存在原设备');
  });

  it('keeps theme, settings, import and export controls reachable', async () => {
    const services = fakeServices(createDefaultSnapshot());
    render(<App services={services} />);
    await screen.findByText('GitHub');

    fireEvent.click(screen.getByRole('button', { name: '主题' }));
    expect(screen.getByRole('list', { name: '内置主题' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭主题' }));

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getByRole('button', { name: '导出备份' })).toBeInTheDocument();
    expect(screen.getByLabelText('导入备份')).toBeInTheDocument();
  });

  it('persists only a committed valid search template', async () => {
    const services = fakeServices(createDefaultSnapshot());
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.change(screen.getByRole('combobox', { name: '搜索引擎' }), { target: { value: 'custom' } });
    const input = screen.getByLabelText('自定义搜索地址');
    fireEvent.change(input, { target: { value: 'https://bing.com/search?q=query' } });
    fireEvent.blur(input);
    expect(services.coordinator.saveAndSync).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'https://bing.com/search?q=%s' } });
    fireEvent.blur(input);
    await waitFor(() => expect(services.coordinator.saveAndSync).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ searchTemplate: 'https://bing.com/search?q=%s' }),
    })));
  });

  it('opens sorting in a side drawer and restores focus on close', async () => {
    const services = fakeServices(createDefaultSnapshot());
    render(<App services={services} />);
    await screen.findByText('GitHub');

    const trigger = screen.getByRole('button', { name: '管理排序' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '书签排序' });
    expect(dialog).toHaveTextContent('当前分组');
    expect(dialog).toHaveTextContent('开发');
    expect(screen.getByRole('button', { name: '排序 GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'GitHub' })).not.toHaveAttribute('aria-roledescription');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '书签排序' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes drawers with Escape, restores focus, and atomically leaves a custom background', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.useCustomBackground = true;
    const services = fakeServices(snapshot);
    render(<App services={services} />);
    await screen.findByText('GitHub');

    const themeTrigger = screen.getByRole('button', { name: '主题' });
    fireEvent.click(themeTrigger);
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭主题' })).toHaveFocus());
    const themeDialog = screen.getByRole('dialog', { name: '主题设置' });
    const themeFocusable = themeDialog.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])');
    themeFocusable.item(themeFocusable.length - 1).focus();
    fireEvent.keyDown(themeDialog, { key: 'Tab' });
    expect(themeFocusable.item(0)).toHaveFocus();
    fireEvent.keyDown(themeDialog, { key: 'Tab', shiftKey: true });
    expect(themeFocusable.item(themeFocusable.length - 1)).toHaveFocus();
    fireEvent.click(screen.getByRole('listitem', { name: '极光' }));
    await waitFor(() => expect(services.coordinator.saveAndSync).toHaveBeenLastCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ themeId: 'aurora', useCustomBackground: false }),
    })));
    fireEvent.keyDown(themeDialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '主题设置' })).not.toBeInTheDocument();
    await waitFor(() => expect(themeTrigger).toHaveFocus());

    const settingsTrigger = screen.getByRole('button', { name: '设置' });
    fireEvent.click(settingsTrigger);
    const settingsDialog = screen.getByRole('dialog', { name: '应用设置' });
    const settingsFocusable = settingsDialog.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])');
    settingsFocusable.item(settingsFocusable.length - 1).focus();
    fireEvent.keyDown(settingsDialog, { key: 'Tab' });
    expect(settingsFocusable.item(0)).toHaveFocus();
    fireEvent.keyDown(settingsDialog, { key: 'Tab', shiftKey: true });
    expect(settingsFocusable.item(settingsFocusable.length - 1)).toHaveFocus();
    fireEvent.keyDown(settingsDialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '应用设置' })).not.toBeInTheDocument();
    await waitFor(() => expect(settingsTrigger).toHaveFocus());
  });

  it('clears the local background before resetting the snapshot', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.useCustomBackground = true;
    const services = fakeServices(snapshot);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '重置全部数据' }));

    await waitFor(() => expect(services.backgrounds.clear).toHaveBeenCalledOnce());
    expect(services.coordinator.saveAndSync).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ useCustomBackground: false }),
    }));
  });

  it('drops a missing custom background when replacing from a JSON backup', async () => {
    const current = createDefaultSnapshot();
    current.settings.useCustomBackground = true;
    const imported = createDefaultSnapshot();
    imported.settings.useCustomBackground = true;
    const services = fakeServices(current);
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    const file = new File([await exportSnapshot(imported).text()], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('导入备份'), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole('button', { name: '确认导入' }));

    await waitFor(() => expect(services.backgrounds.clear).toHaveBeenCalledOnce());
    expect(services.coordinator.saveAndSync).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ useCustomBackground: false }),
    }));
  });

  it('shows a recoverable sync error when persistence rejects', async () => {
    const services = fakeServices(createDefaultSnapshot());
    services.coordinator.saveAndSync = vi.fn().mockRejectedValue(new Error('local write failed'));
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '添加书签' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Docs' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com/docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }));

    await waitFor(() => expect(screen.getAllByRole('status').some((node) => node.textContent?.includes('local write failed'))).toBe(true));
  });

  it('ignores a subscription pull that completes after unmount', async () => {
    const services = fakeServices(createDefaultSnapshot());
    let notify!: () => void;
    services.sync.subscribe = vi.fn((listener) => { notify = listener; return vi.fn(); });
    let resolvePull!: (snapshot: AppSnapshot) => void;
    services.sync.pull = vi.fn()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePull = resolve; }));
    const view = render(<App services={services} />);
    await screen.findByText('GitHub');
    notify();
    await Promise.resolve();
    view.unmount();
    resolvePull(createDefaultSnapshot());
    await Promise.resolve();

    expect(services.repository.save).not.toHaveBeenCalled();
  });

  it('resets through the real Edge provider without reviving removed remote bookmarks', async () => {
    const old = createDefaultSnapshot();
    old.bookmarks.push({ ...old.bookmarks[0]!, id: 'obsolete', title: 'Obsolete', order: 4 });
    const remote: Record<string, unknown> = { meta: { schemaVersion: 1 }, settings: old.settings };
    old.groups.forEach((group) => { remote[`group:${group.id}`] = group; });
    old.bookmarks.forEach((bookmark) => { remote[`bookmark:${bookmark.id}`] = bookmark; });
    const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
    const area = {
      async get() { return { ...remote }; },
      async set(items: Record<string, unknown>) { Object.assign(remote, items); listeners.forEach((listener) => listener({}, 'sync')); },
      async remove(keys: string[]) { keys.forEach((key) => delete remote[key]); listeners.forEach((listener) => listener({}, 'sync')); },
      async getBytesInUse() { return 0; },
    };
    const changes = {
      addListener(listener: (changes: Record<string, unknown>, area: string) => void) { listeners.add(listener); },
      removeListener(listener: (changes: Record<string, unknown>, area: string) => void) { listeners.delete(listener); },
    };
    const provider = new EdgeSyncProvider(area, changes, { debounceMs: 0, now: () => 1 });
    let local = old;
    const repository = { load: vi.fn(async () => local), save: vi.fn(async (next: AppSnapshot) => { local = next; }) };
    const backgrounds = { get: vi.fn().mockResolvedValue(undefined), put: vi.fn(), clear: vi.fn().mockResolvedValue(undefined) };
    const services: AppServices = {
      repository, sync: provider, coordinator: new SyncCoordinator(repository, provider), backgrounds,
      navigate: vi.fn(), download: vi.fn(), now: () => 2, createId: () => 'id',
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App services={services} />);
    expect(await screen.findByText('Obsolete')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '重置全部数据' }));

    await waitFor(() => expect(remote['bookmark:obsolete']).toBeUndefined());
    await waitFor(() => expect(screen.queryByText('Obsolete')).not.toBeInTheDocument());
    expect(local.bookmarks.some(({ id }) => id === 'obsolete')).toBe(false);
    expect(backgrounds.clear).toHaveBeenCalledOnce();
  });
});
