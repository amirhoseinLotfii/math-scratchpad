/**
 * Component Scanner for Phase C-3
 * Scans all .tsx and .ts files for style issues
 */

const fs = require('fs');
const path = require('path');

// Directories to scan
const dirs = ['src/components', 'src/features'];

// Issues to find
const patterns = {
  hardcodedColors: /#[0-9a-f]{3,6}/g,
  inlineStyles: /style=\s*\{[^}]*\}/g,
  pxValues: /\b(\d+px)\b/g,
  marginPadding: /(margin|padding)\s*:\s*[^;]+/g,
};

// Results
const results = {
  files: [],
  issues: {
    hardcodedColors: [],
    inlineStyles: [],
    pxValues: [],
  },
  components: new Set(),
};

// Scan function
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(__dirname, filePath);
    
    // Check for issues
    const issues = {};
    
    // Hardcoded colors
    const colors = content.match(patterns.hardcodedColors);
    if (colors) {
      issues.hardcodedColors = [...new Set(colors)];
      results.issues.hardcodedColors.push({ file: relativePath, colors });
    }
    
    // Inline styles
    const inlineStyles = content.match(patterns.inlineStyles);
    if (inlineStyles) {
      issues.inlineStyles = inlineStyles.length;
      results.issues.inlineStyles.push({ file: relativePath, count: inlineStyles.length });
    }
    
    // PX values
    const pxMatches = content.match(patterns.pxValues);
    if (pxMatches) {
      issues.pxValues = [...new Set(pxMatches)];
      results.issues.pxValues.push({ file: relativePath, values: [...new Set(pxMatches)] });
    }
    
    if (Object.keys(issues).length > 0) {
      results.files.push({ file: relativePath, issues });
    }
    
    // Extract component name
    const componentMatch = content.match(/export\s+(?:function|const|class)\s+(\w+)/);
    if (componentMatch) {
      results.components.add(componentMatch[1]);
    }
    
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
}

// Walk directory
function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      scanFile(fullPath);
    }
  }
}

// Main
console.log('🔍 Scanning components for style issues...\n');

for (const dir of dirs) {
  const fullPath = path.join(__dirname, dir);
  if (fs.existsSync(fullPath)) {
    walkDir(fullPath);
  }
}

// Print results
console.log('📊 Scan Results\n');
console.log(`Total files scanned: ${results.files.length}`);
console.log(`Total components found: ${results.components.size}`);
console.log(`Components: ${Array.from(results.components).join(', ')}\n`);

console.log('🔴 Issues Found:\n');

if (results.issues.hardcodedColors.length > 0) {
  console.log(`🎨 Hardcoded Colors: ${results.issues.hardcodedColors.length} files`);
  results.issues.hardcodedColors.forEach(({ file, colors }) => {
    console.log(`  ${file}: ${colors.join(', ')}`);
  });
  console.log();
}

if (results.issues.inlineStyles.length > 0) {
  console.log(`📏 Inline Styles: ${results.issues.inlineStyles.length} files`);
  results.issues.inlineStyles.forEach(({ file, count }) => {
    console.log(`  ${file}: ${count} inline style(s)`);
  });
  console.log();
}

if (results.issues.pxValues.length > 0) {
  console.log(`📐 PX Values: ${results.issues.pxValues.length} files`);
  results.issues.pxValues.forEach(({ file, values }) => {
    console.log(`  ${file}: ${values.slice(0, 5).join(', ')}${values.length > 5 ? '...' : ''}`);
  });
  console.log();
}

if (results.files.length === 0) {
  console.log('✅ No style issues found! All components look good.');
}

// Save results
const report = {
  timestamp: new Date().toISOString(),
  files: results.files,
  components: Array.from(results.components),
  issues: results.issues,
};

fs.writeFileSync(path.join(__dirname, 'component-scan-report.json'), JSON.stringify(report, null, 2));
console.log('💾 Report saved to component-scan-report.json');
