import type { ColorScheme } from '@/theme/tokens';

export type CodeTokenKind =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'builtin'
  | 'operator'
  | 'plain';

export type CodeTokenColors = Record<CodeTokenKind, string>;

export const codeTokenColors: Record<ColorScheme, CodeTokenColors> = {
  dark: {
    keyword: '#C678DD',
    string: '#98C379',
    comment: '#5C6370',
    number: '#D19A66',
    builtin: '#61AFEF',
    operator: '#56B6C2',
    plain: '#ABB2BF',
  },
  light: {
    keyword: '#A626A4',
    string: '#50A14F',
    comment: '#6A737D',
    number: '#986801',
    builtin: '#4078F2',
    operator: '#0184BC',
    plain: '#383A42',
  },
};
