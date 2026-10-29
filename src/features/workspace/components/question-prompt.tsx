/** Separate an explicit English heading from Persian instructions without guessing a title. */
export function QuestionPrompt({prompt}:{prompt?:string}) {
 if(!prompt)return null;
 const parts=prompt.match(/^([A-Za-z][^\u0600-\u06ff]*?)(?:\s*[:\n]\s*)([\s\S]*[\u0600-\u06ff][\s\S]*)$/);
 return parts?<><p className="question-label small" dir="ltr">{parts[1].trim()}</p><p className="persian-question" lang="fa" dir="auto">{parts[2].trim()}</p></>:<p className="persian-question" lang={/[\u0600-\u06ff]/.test(prompt)?'fa':undefined} dir="auto">{prompt}</p>;
}
