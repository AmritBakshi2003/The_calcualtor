import { describe, expect, it } from 'vitest';
import { mergeCrossChecks, type RemoteRead } from './crossCheckMerge';

const ocrSpace: RemoteRead = { engine: 'ocrspace', text: '144/12', parses: true };
const gemini: RemoteRead = { engine: 'gemini', text: '144/12', parses: true, confidence: 0.9 };

describe('mergeCrossChecks', () => {
  it('keeps a parsed local reading and never replaces it', () => {
    expect(mergeCrossChecks('parses', '144/12', [ocrSpace, gemini])).toEqual({
      expression: '144/12',
      source: 'local',
      hasSuggestion: false,
    });
  });

  it('flags a suggestion when a remote reading disagrees with a parsed local read', () => {
    const other: RemoteRead = { engine: 'gemini', text: '144+12', parses: true, confidence: 0.7 };
    const outcome = mergeCrossChecks('parses', '144/12', [other]);
    expect(outcome).toEqual({ expression: '144/12', source: 'local', hasSuggestion: true });
  });

  it('ignores disagreeing remote reads that do not parse', () => {
    const bad: RemoteRead = { engine: 'gemini', text: '144+12', parses: false, confidence: 0.9 };
    const outcome = mergeCrossChecks('parses', '144/12', [bad]);
    expect(outcome).toEqual({ expression: '144/12', source: 'local', hasSuggestion: false });
  });

  it('falls back to OCR.space when the local engine produced nothing', () => {
    expect(mergeCrossChecks('missing', '', [ocrSpace, gemini])).toEqual({
      expression: '144/12',
      source: 'ocrspace',
      hasSuggestion: false,
    });
  });

  it('falls back to Gemini when OCR.space is unavailable', () => {
    expect(mergeCrossChecks('missing', '', [gemini])).toEqual({
      expression: '144/12',
      source: 'gemini',
      hasSuggestion: false,
    });
  });

  it('ignores remote readings that do not parse', () => {
    const junk: RemoteRead = { engine: 'ocrspace', text: 'kidnapped-text', parses: false };
    expect(mergeCrossChecks('missing', '', [junk])).toEqual({
      expression: '',
      source: 'local',
      hasSuggestion: false,
    });
  });

  it('marks suggestions when the box is empty but a remote read exists', () => {
    expect(mergeCrossChecks('empty', '', [ocrSpace])).toEqual({
      expression: '',
      source: 'local',
      hasSuggestion: true,
    });
  });

  it('with no remotes at all, missing locals stay empty', () => {
    expect(mergeCrossChecks('missing', '', [])).toEqual({
      expression: '',
      source: 'local',
      hasSuggestion: false,
    });
  });
});
