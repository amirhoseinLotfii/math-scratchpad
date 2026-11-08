/**
 * Color Migration Script
 * Replaces hardcoded colors in styles.css with Design System tokens
 */

const fs = require('fs');
const path = require('path');

// Color mapping: hardcoded -> Design System token
const colorMap = {
  // Background colors
  '#121a18': 'var(--color-background)',
  '#151719': 'var(--color-background)',
  '#1b2420': 'var(--color-surface-sunken)',
  '#1b2721': 'var(--color-surface-sunken)',
  '#1b3329': 'var(--color-background)',
  '#19271e': 'var(--color-surface-sunken)',
  '#192b20': 'var(--color-surface-sunken)',
  '#202326': 'var(--color-surface)',
  '#202624': 'var(--color-surface)',
  '#213c2e': 'var(--color-highlight)',
  '#222925': 'var(--color-surface-sunken)',
  '#223f31': 'var(--color-highlight)',
  '#252721': 'var(--color-surface-sunken)',
  '#252b28': 'var(--color-surface-sunken)',
  '#252d29': 'var(--color-surface-sunken)',
  '#254b37': 'var(--color-highlight)',
  '#254c3d': 'var(--color-highlight)',
  '#263b2d': 'var(--color-highlight)',
  '#284f3b': 'var(--color-highlight)',
  '#2b302f': 'var(--color-surface-elevated)',
  '#2e4035': 'var(--color-highlight)',
  '#292d30': 'var(--color-surface-elevated)',
  '#303634': 'var(--color-surface-elevated)',
  '#332727': 'var(--color-surface)',
  '#333a36': 'var(--color-surface)',
  '#342c1d': 'var(--color-surface)',
  '#343c37': 'var(--color-surface)',
  '#352f24': 'var(--color-surface)',
  '#3b2929': 'var(--color-surface)',
  
  // Text colors
  '#b2b9b5': 'var(--color-text-muted)',
  '#b4cce0': 'var(--color-text-secondary)',
  '#b8c5bf': 'var(--color-text-muted)',
  '#c0ecd0': 'var(--color-text-secondary)',
  '#d0f5e2': 'var(--color-primary)',
  '#e0a43a': 'var(--color-warning)',
  '#e4b66b': 'var(--color-warning)',
  '#e7ebe8': 'var(--color-text-primary)',
  '#e8f4eb': 'var(--color-text-secondary)',
  '#e8fff1': 'var(--color-text-primary)',
  '#f0b8b8': 'var(--color-error)',
  '#f0ca81': 'var(--color-warning)',
  '#f2f6f3': 'var(--color-text-primary)',
  '#f4c16f': 'var(--color-warning)',
  '#f4cd70': 'var(--color-warning)',
  '#ffffff': 'var(--color-text-primary)',
  
  // Primary colors
  '#101a14': 'var(--color-primary-foreground)',
  '#163d2e': 'var(--color-primary-foreground)',
  '#203c2f': 'var(--color-highlight)',
  '#3d6652': 'var(--color-highlight)',
  '#402e17': 'var(--color-highlight-foreground)',
  '#426b4e': 'var(--color-highlight)',
  '#4c7656': 'var(--color-highlight)',
  '#52745f': 'var(--color-highlight)',
  '#527861': 'var(--color-success)',
  '#54748d': 'var(--color-primary)',
  '#567b65': 'var(--color-success)',
  '#679479': 'var(--color-success)',
  '#6f5b34': 'var(--color-warning)',
  '#707a75': 'var(--color-border)',
  '#719b85': 'var(--color-primary)',
  '#739f85': 'var(--color-success)',
  '#75a98a': 'var(--color-primary)',
  '#7fab96': 'var(--color-primary)',
  '#86b99b': 'var(--color-primary)',
  '#8c6936': 'var(--color-warning)',
  '#8cbfff': 'var(--color-ring)',
  '#8eb79d': 'var(--color-primary)',
  '#8fa89a': 'var(--color-success)',
  '#922018': 'var(--color-error)',
  '#97c8a9': 'var(--color-primary)',
  '#a1c5ae': 'var(--color-primary)',
  '#a82924': 'var(--color-error)',
  '#a9e6bc': 'var(--color-primary)',
  '#b42318': 'var(--color-error)',
  '#7e1b16': 'var(--color-error-hover)',
  
  // Gradients and special
  '#2a302d': 'var(--color-surface-elevated)',
  '#252a28': 'var(--color-surface-sunken)',
};

// RGB colors for rgba() - these need special handling
const rgbaColors = {
  '#52745f66': 'rgba(var(--color-success-500-rgb), 0.4)',
  '#0005': 'rgba(var(--color-neutral-1000-rgb), 0.02)',
  '#0008': 'rgba(var(--color-neutral-1000-rgb), 0.03)',
  '#0009': 'rgba(var(--color-neutral-1000-rgb), 0.04)',
};

// Read the file
const filePath = path.join(__dirname, 'src', 'styles.css');
let content = fs.readFileSync(filePath, 'utf8');

// Replace hardcoded colors
let changesMade = 0;

// First, replace rgba colors
for (const [hex, token] of Object.entries(rgbaColors)) {
  const regex = new RegExp(hex, 'g');
  const matches = content.match(regex);
  if (matches) {
    content = content.replace(regex, token);
    changesMade += matches.length;
    console.log(`Replaced ${matches.length} occurrences of ${hex} with ${token}`);
  }
}

// Then replace regular hex colors
for (const [hex, token] of Object.entries(colorMap)) {
  // Match the color as a whole word (not part of another word)
  // This regex matches # followed by 3 or 6 hex digits, but not if it's part of a longer hex value
  const regex = new RegExp(`(^|[^\\w-])${hex}([^\\w]|$)`, 'g');
  let matches;
  let lastIndex = 0;
  let count = 0;
  
  while ((matches = regex.exec(content)) !== null) {
    // Check if this is a standalone color (not part of a longer string like #0005 in a comment)
    const before = matches.index > 0 ? content[matches.index - 1] : '';
    const after = content[matches.index + matches[0].length] || '';
    
    // Only replace if it's a valid color usage (not in middle of a word)
    if (!/[\w-]/.test(before) && !/[\w-]/.test(after)) {
      count++;
    }
    lastIndex = matches.index + matches[0].length;
  }
  
  if (count > 0) {
    // Replace all occurrences
    const actualRegex = new RegExp(hex, 'g');
    const beforeContent = content;
    content = content.replace(actualRegex, (match, offset) => {
      // Check context
      const beforeChar = offset > 0 ? content[offset - 1] : '';
      const afterChar = content[offset + match.length] || '';
      
      // Only replace if it's a standalone color
      if (!/[\w-]/.test(beforeChar) && !/[\w-]/.test(afterChar)) {
        return token;
      }
      return match;
    });
    
    const actualChanges = (beforeContent.length - content.length) / hex.length;
    if (actualChanges > 0) {
      changesMade += actualChanges;
      console.log(`Replaced ${actualChanges} occurrences of ${hex} with ${token}`);
    }
  }
}

// Write the file back
if (changesMade > 0) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`\n✅ Successfully migrated ${changesMade} hardcoded colors!`);
} else {
  console.log('ℹ️ No changes made (all colors may already be migrated).');
}

// Count remaining hardcoded colors
const remainingColors = (content.match(/#[0-9a-f]{3,6}/g) || []).length;
console.log(`\n📊 Remaining hardcoded colors: ${remainingColors}`);
