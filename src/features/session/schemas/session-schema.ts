import { z } from 'zod';
export const confidenceSchema = z.object({
 confidence: z.enum(['low', 'medium', 'high'], { required_error: 'Choose your confidence before continuing.', invalid_type_error: 'Choose your confidence before continuing.' }),
});
export const answerFields = {
 answerType: z.enum(['math','text','choice']).optional(),
 choices: z.array(z.string().trim().min(1).max(400)).min(2).max(20).optional(),
 answerText: z.string().max(10000).optional(),
};
export const metadataSchema = z.object({
 ...answerFields,
 confidence: z.enum(['low', 'medium', 'high']).optional(),
 elapsedMs: z.number().finite().nonnegative().optional(),
 skipped: z.boolean().optional(),
}).passthrough().refine(v => v.answerType !== 'choice' || (!!v.choices && new Set(v.choices).size === v.choices.length && (!v.answerText || v.choices.includes(v.answerText))), 'Choice answers need distinct choices and a valid selection.');
export const problemSchema = z.object({
 source: z.string().trim().min(1, 'Enter a problem first.').max(4000, 'Use at most 4000 characters.'),
 mode: z.enum(['math', 'text']),
});
export const jsonInputSchema = z.object({
 json: z.string().min(1, 'Paste a session JSON backup.').max(1000000, 'Session is too large.'),
});
