import { useEffect, useState } from 'react';
import type { SessionMeta } from '../model';
import { markWellbeingAsked, wellbeingAsked } from '../shared/lib/ui-prefs';

/** Owns the optional anxiety/energy prompt shown at the start of a multi-question batch. */
export function useWellbeing({ multipleQuestions, sessionId, session, storageConflict }: { multipleQuestions: boolean; sessionId: string; session: SessionMeta | undefined; storageConflict: boolean }) {
 const [wellbeingDismissed, setWellbeingDismissed] = useState<string | null>(null);
 const needWellbeing = multipleQuestions && !!sessionId && session?.anxiety === undefined && session?.energy === undefined && wellbeingDismissed !== sessionId && !wellbeingAsked(sessionId) && !storageConflict;
 const [askingFor, setAskingFor] = useState<string | null>(null), [editingScales, setEditingScales] = useState(false), askWellbeing = !!askingFor && askingFor === sessionId && wellbeingDismissed !== sessionId;
 useEffect(() => { if (needWellbeing) { setEditingScales(false); setAskingFor(sessionId); } }, [needWellbeing, sessionId]);
 /** Re-opens the prompt from the menu so the learner can change the saved ratings. */
 function editScales() { setEditingScales(true); setWellbeingDismissed(null); setAskingFor(sessionId); }
 function dismiss() { markWellbeingAsked(sessionId); setWellbeingDismissed(sessionId); }
 function close() { dismiss(); setEditingScales(false); }
 return { askWellbeing, editingScales, editScales, dismiss, close };
}
