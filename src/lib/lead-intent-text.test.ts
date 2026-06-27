import { describe, it, expect } from 'vitest';
import { gatherIntentText } from './lead-intent-text';

describe('gatherIntentText', () => {
  it('gom field_data values + tên form/ad + message', () => {
    const out = gatherIntentText({
      fieldData: [{ name: 'xe_quan_tam', values: ['Sorento'] }],
      formName: 'Form KIA Sorento',
      adName: 'AD Seltos tháng 6',
      message: 'em hỏi giá CX-5',
    });
    expect(out).toContain('Sorento');
    expect(out).toContain('Form KIA Sorento');
    expect(out).toContain('AD Seltos');
    expect(out).toContain('CX-5');
  });
  it('bỏ qua nguồn null/undefined, không crash', () => {
    expect(gatherIntentText({ message: 'chào' })).toBe('chào');
    expect(gatherIntentText({})).toBe('');
  });
});
