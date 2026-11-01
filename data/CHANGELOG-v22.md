# MATH_QUESTION_BANK v22

Input: `MATH_QUESTION_BANK.json` v21 (708 questions), downloaded read-only from the user's selected Google Drive bank.

## Changes

- Added ordered reading chunks for lessons 1.1–1.7. Each chunk contains no more than four paragraph, definition, or note blocks and references one to three in-lesson questions.
- Reused existing Learn questions where possible and added 144 new short, open-response checks. New checks contain only question text and are typed responses; they have no answer or solution fields.
- Added 12 answer-free practice questions for the textbook's in-lesson Try It prompts, preserving their original prompt text and concept placement. They are ordered before that concept's end-of-section exercises.
- Added 227 learning chunks in total: 68 for 1.1, 32 for 1.2, 21 for 1.3, 27 for 1.4, 31 for 1.5, 24 for 1.6, and 24 for 1.7.
- The bank contains 864 questions total (708 from v21, plus 144 reading checks and 12 Try It prompts).
- Kept the original chapter metadata, section ranges, ordering, questions, images, and existing book worked-example solutions.
- Converted 12 blocks in lesson 1.1 that were textbook exercise prompts with embedded worked steps into prompt-only paragraph blocks. This removes exercise solutions from the public bank while retaining the prompts and source order.
- The review lesson is preserved as-is and does not receive the active chunk flow.

## Validation

The complete v22 file is validated in `tests/unit/lesson-active-flow.test.ts` with the app's `validateBank` parser. That test also checks the chunk references, answer-free Try It questions, answer-key field scan, and removal of the identified exercise solutions.

To rebuild from a local v21 file:

```sh
npm run bank:v22 -- /path/to/MATH_QUESTION_BANK.json data/MATH_QUESTION_BANK_v22.json
```

The script writes only to the requested local path. It does not upload or modify Google Drive.
