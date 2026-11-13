import * as z from 'zod/mini';
export const confidenceSchema = z.object({
 confidence: z.enum(['low', 'medium', 'high'], { error: 'Choose your confidence before continuing.' }),
});
export const metadataSchema = z.looseObject({
 confidence: z.optional(z.enum(['low', 'medium', 'high'])),
 elapsedMs: z.optional(z.number().check(z.nonnegative())),
 skipped: z.optional(z.boolean()),
});
export const problemSchema = z.object({
 source: z.string().check(z.trim(), z.minLength(1, 'Enter a problem first.'), z.maxLength(4000, 'Use at most 4000 characters.')),
 mode: z.enum(['math', 'text']),
});
export const jsonInputSchema = z.object({
 json: z.string().check(z.minLength(1, 'Paste a session JSON backup.'), z.maxLength(1000000, 'Session is too large.')),
});
