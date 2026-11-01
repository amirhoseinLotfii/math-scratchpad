# MATH_QUESTION_BANK v23

Input: the project-built `data/MATH_QUESTION_BANK_v22.json`.

## Changes

- Ensured three answer-free reading checks per short chunk for Chapter 1 lessons 1.1–1.7, retaining each existing check so saved v22 responses remain attached to the same question. New prompts quote a complete sentence from that exact chunk and ask for a source-based response: two-option selection with a written rationale, true/false with a reason, finding and correcting a likely misreading, or a short explanation. Math expressions and sets are kept whole in quoted sources. No correctness key is included.
- Added three optional, clearly labelled same-level practice prompts to each of the 39 concepts in lessons 1.1–1.7. Each set is anchored to an exercise assigned to that concept (or, for the introductory concept with no book exercise, its source-based check): one reuses the exact book prompt and two ask the learner to explain the approach or find and correct a likely mistake for that same prompt. No new numbers, topics, or answer keys were added.
- Added `{ chapter, lesson, section, concept, skill, source }` tags to Chapter 1 questions. Every non-book item has `source: "extra"` and a `modeledOn` reference to a book item in the same or an earlier section; every book item is assigned to its lesson flow.
- Marked all 61 existing «مثال آموزشی تکمیلی» blocks with `source: "extra"` and a same-concept `modeledOn` book-item reference. Cross-checked them against the uploaded OpenStax PDF. Reworded three examples to avoid previewing inverse functions in 1.2, asymptotes in 1.5, and systems/intersections framing in 1.6; they now practice only the section skill.
- Added interaction-type metadata to Chapter 1 questions so mixed review can be selected from the bank without hardcoded section lists.
- The validator now also accepts an optional multi-chapter envelope for a combined course bank, assigning each lesson to exactly one chapter. Existing single-chapter v21/v22 banks keep loading as before.
- For v23+, the validator rejects missing/invalid provenance, extras without a book anchor, future-section anchors, book questions missing from the section flow, and supplemental examples missing or pointing to a later book item. v21/v22 retain their previous loading behavior.
- Kept the v22 review lesson and all non-target lesson content unchanged.
- The bank contains 1,435 questions and is approximately 2.30 MB UTF-8 (about 1.91 million pretty-printed characters), within the app's 2.00 million-character parse limit and 3.00 million-character offline cache limit.

## Validation

The new bank is parsed by the app's extended backward-compatible bank schema and is covered by tests for all 227 chunk assignments, three checks per chunk, concept-level extra practice, source/model tags, section flow coverage, no future anchors, backward-compatible v22 loading, and forbidden answer/solution fields.

To rebuild from the checked-in v22 artifact:

```sh
npm run bank:v23
```

The script writes locally only. It does not upload or modify Google Drive.
