import { describe, expect, it } from 'vitest';
import { migrateDocument } from '../../src/domain/sync/migrate-document';

describe('Document Migration - UT-05', () => {
  it('migrates legacy session-v3 document into ChapterProgress without losing steps', () => {
    const legacySession = {
      version: 2,
      doc: {
        session: {
          bankId: 'PC-1.1',
          bankVersion: 'v21'
        },
        exercises: [
          {
            id: 'ex-1',
            bankQuestionId: 'PC-1.1-L01',
            mode: 'math',
            source: '2x + 1 = 5',
            submittedAt: '2026-11-21T07:00:00Z',
            confidence: 'high',
            steps: [
              { id: 'step-0', mathLatex: '2x + 1 = 5', final: false },
              { id: 'step-1', mathLatex: '2x = 4', final: false },
              { id: 'step-2', mathLatex: 'x = 2', final: true }
            ]
          }
        ],
        exerciseId: 'ex-1'
      }
    };

    const res = migrateDocument(legacySession, 'dev-test');
    expect(res.kind).toBe('chapter_progress');
    expect(res.document).toBeDefined();

    const prog = res.document as any;
    expect(prog.chapterId).toBe('PC-1.1');
    expect(prog.bankVersion).toBe('v21');

    const item = prog.items['PC-1.1-L01'];
    expect(item).toBeDefined();
    expect(item.status).toBe('solved');
    expect(Object.keys(item.steps).length).toBe(3);
    expect(item.steps['step-1'].segments[0].content).toBe('2x = 4');
  });

  it('migrates math-scratchpad-server-state/v1 records array cleanly', () => {
    const legacyServerState = {
      format: 'math-scratchpad-server-state/v1',
      revision: 1500,
      records: [
        {
          key: 'math-scratchpad-lesson-progress-v1:PC-1.1:v21',
          value: JSON.stringify({
            bankId: 'PC-1.1',
            bankVersion: 'v21',
            lessons: {
              'lesson-1': {
                lessonId: 'PC-1.1',
                workAnswers: {
                  'item-alpha': {
                    steps: [
                      { id: 's1', segments: [{ type: 'persian_text', content: 'حل معادله' }] }
                    ]
                  }
                }
              }
            }
          })
        }
      ]
    };

    const res = migrateDocument(legacyServerState, 'dev-test');
    expect(res.kind).toBe('chapter_progress');
    const prog = res.document as any;
    expect(prog.chapterId).toBe('PC-1.1');
    expect(prog.items['item-alpha'].steps['s1'].segments[0].content).toBe('حل معادله');
  });
});
