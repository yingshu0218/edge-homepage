import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../../domain/defaults';
import { SettingsPanel } from './SettingsPanel';

afterEach(cleanup);

describe('SettingsPanel', () => {
  it('updates search and theme preferences', () => {
    const onSearchTemplateChange = vi.fn();
    const onThemeParametersChange = vi.fn();
    render(
      <SettingsPanel
        snapshot={createDefaultSnapshot()}
        syncState={{ kind: 'local' }}
        onSearchTemplateChange={onSearchTemplateChange}
        onThemeParametersChange={onThemeParametersChange}
        onImport={vi.fn()}
        onExport={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索引擎'), { target: { value: 'https://www.bing.com/search?q=%s' } });
    fireEvent.change(screen.getByLabelText('遮罩强度'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('模糊强度'), { target: { value: '8' } });

    expect(onSearchTemplateChange).toHaveBeenCalledWith('https://www.bing.com/search?q=%s');
    expect(onThemeParametersChange).toHaveBeenCalledWith({ overlay: 0.5, blur: 8 });
  });

  it('imports a chosen file using replace or merge mode', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsPanel snapshot={createDefaultSnapshot()} syncState={{ kind: 'local' }} onSearchTemplateChange={vi.fn()} onThemeParametersChange={vi.fn()} onImport={onImport} onExport={vi.fn()} onReset={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('合并数据'));
    fireEvent.change(screen.getByLabelText('导入备份'), { target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] } });

    await waitFor(() => expect(onImport).toHaveBeenCalledWith('{}', 'merge'));
  });

  it('requires confirmation before reset', () => {
    const onReset = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(
      <SettingsPanel snapshot={createDefaultSnapshot()} syncState={{ kind: 'local' }} onSearchTemplateChange={vi.fn()} onThemeParametersChange={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onReset={onReset} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '重置全部数据' }));
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '重置全部数据' }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
