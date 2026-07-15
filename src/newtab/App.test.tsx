import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import type { SyncState } from '../sync/types';
import { App, type AppServices } from './App';

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

  it('keeps the local start page usable when the Edge pull is unavailable', async () => {
    const services = fakeServices(createDefaultSnapshot());
    services.sync.pull = vi.fn().mockRejectedValue(new Error('Edge sync unavailable'));
    render(<App services={services} />);

    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(screen.getAllByRole('status').some((status) => /同步失败/.test(status.textContent ?? ''))).toBe(true);
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
});
