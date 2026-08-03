import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SyncStatus } from './SyncStatus';

describe('SyncStatus', () => {
  it('describes only observable sync state', () => {
    const { rerender } = render(<SyncStatus state={{ kind: 'local' }} />);
    expect(screen.getByText('数据保存在本机')).toBeInTheDocument();
    expect(screen.queryByText(/Microsoft|登录|账户/)).not.toBeInTheDocument();

    rerender(<SyncStatus state={{ kind: 'error', message: 'quota', localSaved: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent('已保存在本机，同步失败：quota');
  });
});
