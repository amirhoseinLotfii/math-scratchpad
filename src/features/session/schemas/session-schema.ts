import { z } from 'zod';
export const confidenceSchema = z.object({
 confidence: z.enum(['low', 'medium', 'high'], { required_error: 'Choose your confidence before continuing.', invalid_type_error: 'Choose your confidence before continuing.' }),
});
export const metadataSchema = z.object({
 confidence: z.enum(['low', 'medium', 'high']).optional(),
 elapsedMs: z.number().finite().nonnegative().optional(),
 skipped: z.boolean().optional(),
}).passthrough();
export const problemSchema = z.object({
 source: z.string().trim().min(1, 'Enter a problem first.').max(4000, 'Use at most 4000 characters.'),
 mode: z.enum(['math', 'text']),
});
export const jsonInputSchema = z.object({
 json: z.string().min(1, 'Paste a session JSON backup.').max(1000000, 'Session is too large.'),
});
