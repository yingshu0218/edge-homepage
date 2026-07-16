import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../../domain/defaults';
import { SettingsPanel } from './SettingsPanel';
import { exportSnapshot } from '../../storage/transfer';

afterEach(cleanup);

describe('SettingsPanel', () => {
  it('uses Google by default and saves a selected preset immediately', () => {
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

    expect(screen.getByRole('combobox', { name: '搜索引擎' })).toHaveValue('google');
    expect(screen.getByRole('option', { name: 'Google' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bing' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '百度' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'DuckDuckGo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Brave' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '搜狗' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '360 搜索' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '自定义' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '搜索引擎' }), { target: { value: 'bing' } });
    fireEvent.change(screen.getByLabelText('遮罩强度'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('模糊强度'), { target: { value: '8' } });

    expect(onSearchTemplateChange).toHaveBeenCalledWith('https://www.bing.com/search?q=%s');
    expect(onThemeParametersChange).toHaveBeenCalledWith({ overlay: 0.5, blur: 8 });
  });

  it('selects custom for an unknown template and rejects incomplete or unsafe drafts', () => {
    const onSearchTemplateChange = vi.fn();
    const snapshot = createDefaultSnapshot();
    snapshot.settings.searchTemplate = 'https://private.example/?q=%s';
    render(<SettingsPanel snapshot={snapshot} syncState={{ kind: 'local' }} onSearchTemplateChange={onSearchTemplateChange} onThemeParametersChange={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: '搜索引擎' })).toHaveValue('custom');
    const input = screen.getByLabelText('自定义搜索地址');

    const original = snapshot.settings.searchTemplate;
    for (let length = original.length - 1; length >= 0; length -= 1) {
      fireEvent.change(input, { target: { value: original.slice(0, length) } });
      expect(onSearchTemplateChange).not.toHaveBeenCalled();
    }
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toHaveTextContent('%s');
    fireEvent.change(input, { target: { value: 'https://bing.com/search?q=query' } });
    fireEvent.blur(input);
    expect(onSearchTemplateChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'javascript:%s' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP');
    expect(onSearchTemplateChange).not.toHaveBeenCalled();
  });

  it('reveals a custom template field only after choosing custom', () => {
    render(<SettingsPanel snapshot={createDefaultSnapshot()} syncState={{ kind: 'local' }} onSearchTemplateChange={vi.fn()} onThemeParametersChange={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByLabelText('自定义搜索地址')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '搜索引擎' }), { target: { value: 'custom' } });
    expect(screen.getByLabelText('自定义搜索地址')).toHaveValue('https://www.google.com/search?q=%s');
  });

  it('tracks imported preference props without writing a stale sibling value', () => {
    const onThemeParametersChange = vi.fn();
    const snapshot = createDefaultSnapshot();
    const { rerender } = render(
      <SettingsPanel snapshot={snapshot} syncState={{ kind: 'local' }} onSearchTemplateChange={vi.fn()} onThemeParametersChange={onThemeParametersChange} onImport={vi.fn()} onExport={vi.fn()} onReset={vi.fn()} />,
    );

    const imported = { ...snapshot, settings: { ...snapshot.settings, overlay: 0.7, blur: 12 } };
    rerender(
      <SettingsPanel snapshot={imported} syncState={{ kind: 'synced', at: 1 }} onSearchTemplateChange={vi.fn()} onThemeParametersChange={onThemeParametersChange} onImport={vi.fn()} onExport={vi.fn()} onReset={vi.fn()} />,
    );
    expect(screen.getByLabelText('遮罩强度')).toHaveValue('0.7');
    expect(screen.getByLabelText('模糊强度')).toHaveValue('12');

    fireEvent.change(screen.getByLabelText('遮罩强度'), { target: { value: '0.8' } });
    expect(onThemeParametersChange).toHaveBeenLastCalledWith({ overlay: 0.8, blur: 12 });
  });

  it('imports a chosen file using replace or merge mode', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsPanel snapshot={createDefaultSnapshot()} syncState={{ kind: 'local' }} onSearchTemplateChange={vi.fn()} onThemeParametersChange={vi.fn()} onImport={onImport} onExport={vi.fn()} onReset={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('合并数据'));
    const text = await exportSnapshot(createDefaultSnapshot()).text();
    fireEvent.change(screen.getByLabelText('导入备份'), { target: { files: [new File([text], 'backup.json', { type: 'application/json' })] } });

    expect(await screen.findByRole('region', { name: '确认导入' })).toHaveTextContent('合并');
    expect(screen.getByRole('region', { name: '确认导入' })).toHaveTextContent('1 个分组 · 4 个书签');
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(text, 'merge'));
  });

  it('cancels an import preview without writing', async () => {
    const onImport = vi.fn();
    render(<SettingsPanel snapshot={createDefaultSnapshot()} syncState={{ kind: 'local' }} onSearchTemplateChange={vi.fn()} onThemeParametersChange={vi.fn()} onImport={onImport} onExport={vi.fn()} onReset={vi.fn()} />);
    const text = await exportSnapshot(createDefaultSnapshot()).text();
    fireEvent.change(screen.getByLabelText('导入备份'), { target: { files: [new File([text], 'backup.json')] } });
    await screen.findByRole('region', { name: '确认导入' });
    fireEvent.click(screen.getByRole('button', { name: '取消导入' }));
    expect(onImport).not.toHaveBeenCalled();
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
