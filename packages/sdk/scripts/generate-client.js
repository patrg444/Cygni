#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to replace imports in generated files
function fixBrowserImports() {
  const servicesDir = path.join(__dirname, '../src/generated/services');
  const coreDir = path.join(__dirname, '../src/generated/core');
  
  // Read all service files
  const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.ts'));
  
  serviceFiles.forEach(file => {
    const filePath = path.join(servicesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace the request import to use a conditional import
    if (content.includes('import { request as __request } from "../core/request"')) {
      // Create a new version with browser detection
      const newContent = content.replace(
        'import { request as __request } from "../core/request";',
        `// @ts-ignore - Dynamic import based on environment
const __request = typeof window !== 'undefined' 
  ? require('../core/request.browser').request
  : require('../core/request').request;`
      );
      
      fs.writeFileSync(filePath, newContent);
      console.log(`Fixed imports in ${file}`);
    }
  });
  
  // Also fix the main index.ts export
  const indexPath = path.join(__dirname, '../src/generated/index.ts');
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  
  if (!indexContent.includes('// Browser-safe exports')) {
    // Add conditional exports
    const browserExports = `
// Browser-safe exports
export * from "./core/ApiError";
export * from "./core/ApiRequestOptions";
export * from "./core/ApiResult";
export * from "./core/CancelablePromise";
export * from "./core/OpenAPI";
// Conditionally export request based on environment
export { request } from "./core/request";
`;
    
    fs.writeFileSync(indexPath, indexContent + '\n' + browserExports);
    console.log('Added browser-safe exports to index.ts');
  }
}

// Run the OpenAPI generator first
const { execSync } = require('child_process');

console.log('Generating API client...');
execSync('npx openapi-typescript-codegen --input ./openapi.json --output ./src/generated --client axios', {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

console.log('\nFixing imports for browser compatibility...');
fixBrowserImports();

console.log('\nClient generation complete!');