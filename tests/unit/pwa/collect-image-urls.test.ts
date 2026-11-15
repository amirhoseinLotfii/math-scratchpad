import { describe, expect, it } from 'vitest';
import { collectImageUrls } from '../../../src/pwa/collect-image-urls';
import type { DriveBank } from '../../../src/features/drive-bank/bank-types';

const bank: DriveBank = {
  schema_version: 'math-scratchpad.bank/1.0',
  bank_id: 'synthetic',
  version: 'v1',
  questions: [],
  lessons: [
    {
      id: 'lesson-1',
      book: 'Synthetic',
      section: '1',
      title: 'Lesson',
      concepts: [
        {
          id: 'concept-1',
          title: 'Concept',
          checkQuestionIds: [],
          blocks: [
            { type: 'image', src: './figures/one.png', alt: 'One' },
            { type: 'image', src: 'https://cdn.example.test/two.png', alt: 'Two' },
            { type: 'image', src: 'https://cdn.example.test/two.png', alt: 'Duplicate' },
            { type: 'image', src: 'https://cdn.example.test/private.png?token=synthetic', alt: 'Private' },
            { type: 'image', src: 'https://cdn.example.test/signed.png?X-Amz-Signature=synthetic', alt: 'Signed' },
            { type: 'image', src: 'http://remote.example.test/insecure.png', alt: 'Insecure' },
            { type: 'paragraph', text: 'No image' },
          ],
        },
      ],
    },
  ],
};

describe('collectImageUrls', () => {
  it('deduplicates lesson images and excludes credential URLs and insecure cross-origin URLs', () => {
    expect(collectImageUrls([bank], 'https://app.example.test/math-scratchpad/')).toEqual([
      'https://app.example.test/math-scratchpad/figures/one.png',
      'https://cdn.example.test/two.png',
    ]);
  });
});
