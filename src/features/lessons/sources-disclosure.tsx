import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { SourceCitation } from '../../domain/entities/bank-chapter.types';

export interface SourcesDisclosureProps {
  sources?: SourceCitation[];
  rawPrompt?: string;
  uiLang: 'fa' | 'en';
}

/**
 * Parses out citations like "پیوند با کتاب..." or "Book citation: ..." from raw prompt text
 */
export function extractSourcesFromText(text: string): { cleanedText: string; extractedSources: SourceCitation[] } {
  if (!text) return { cleanedText: '', extractedSources: [] };

  const extracted: SourceCitation[] = [];
  let cleaned = text;

  // Match Persian patterns like: (پیوند با کتاب: ریاضی ۱، صفحهٔ ۴۲) or پیوند با کتاب: ...
  const persianPattern = /(?:\(|\b)پیوند با کتاب[:\s]+([^،,)]+)(?:[،,]\s*صفحهٔ?\s*([\d\u06F0-\u06F9]+))?(?:[،,]\s*بخش\s*([^)]+))?\)?/g;
  cleaned = cleaned.replace(persianPattern, (_, book, page, section) => {
    extracted.push({
      book: book.trim(),
      page: page?.trim(),
      section: section?.trim()
    });
    return '';
  });

  // Match English patterns like: (Source: Calculus 1, page 42)
  const englishPattern = /(?:\(|\b)Source[:\s]+([^,)]+)(?:,\s*page\s*(\d+))?(?:,\s*section\s*([^)]+))?\)?/gi;
  cleaned = cleaned.replace(englishPattern, (_, book, page, section) => {
    extracted.push({
      book: book.trim(),
      page: page?.trim(),
      section: section?.trim()
    });
    return '';
  });

  return {
    cleanedText: cleaned.trim(),
    extractedSources: extracted
  };
}

export function SourcesDisclosure({ sources = [], rawPrompt, uiLang }: SourcesDisclosureProps) {
  const fa = uiLang === 'fa';
  let allSources = [...sources];

  if (rawPrompt && allSources.length === 0) {
    const { extractedSources } = extractSourcesFromText(rawPrompt);
    allSources = extractedSources;
  }

  if (allSources.length === 0) {
    return null;
  }

  return (
    <details className="lesson-sources-disclosure">
      <summary className="sources-summary">
        <BookOpen className="sources-icon" aria-hidden="true" />
        <span>{fa ? 'منابع و پیوند با کتاب' : 'Sources & Book References'}</span>
      </summary>
      <ul className="sources-list">
        {allSources.map((src, idx) => (
          <li key={idx} className="source-item">
            <span className="source-book font-semibold">{src.book}</span>
            {src.section && (
              <span className="source-section">
                {' '}
                · {fa ? `بخش ${src.section}` : `Section ${src.section}`}
              </span>
            )}
            {src.page && (
              <span className="source-page">
                {' '}
                · {fa ? `صفحهٔ ${src.page}` : `Page ${src.page}`}
              </span>
            )}
            {src.note && <span className="source-note"> ({src.note})</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
