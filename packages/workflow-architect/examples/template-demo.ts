/**
 * Template Library Demo
 * Demonstrates loading, searching, and instantiating workflow templates
 */

import { TemplateRegistry } from '../src/templates/index.js';
import { instantiate, extractVariables, checkPrerequisites } from '../src/templates/instantiator.js';
import { loadFromDirectory } from '../src/templates/loaders/file-loader.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('=== Template Library Demo ===\n');

  // 1. Create registry
  console.log('1. Creating template registry...');
  const registry = new TemplateRegistry({ maxCacheSize: 1000 });
  console.log('✓ Registry created\n');

  // 2. Load templates from directory
  console.log('2. Loading templates from directory...');
  const templatesDir = join(__dirname, 'templates');
  const { templates, errors } = await loadFromDirectory(templatesDir);

  console.log(`✓ Loaded ${templates.length} templates`);
  if (errors.length > 0) {
    console.log(`⚠ ${errors.length} errors:`);
    errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
  }
  console.log();

  // 3. Add templates to registry
  console.log('3. Adding templates to registry...');
  for (const template of templates) {
    registry.addTemplate(template);
    console.log(`✓ Added: ${template.metadata.name} (${template.metadata.id})`);
  }
  console.log();

  // 4. List categories and tags
  console.log('4. Available categories and tags:');
  console.log(`Categories: ${registry.listCategories().join(', ')}`);
  console.log(`Tags: ${registry.listTags().join(', ')}`);
  console.log();

  // 5. Search templates
  console.log('5. Searching for AI templates...');
  const aiTemplates = registry.searchTemplates({ category: 'ai' });
  console.log(`Found ${aiTemplates.length} AI templates:`);
  aiTemplates.forEach(t => console.log(`  - ${t.metadata.name}`));
  console.log();

  // 6. Search with fuzzy matching
  console.log('6. Fuzzy search for "webhook"...');
  const webhookTemplates = registry.searchTemplates({ query: 'webhook' });
  console.log(`Found ${webhookTemplates.length} templates matching "webhook":`);
  webhookTemplates.forEach(t => console.log(`  - ${t.metadata.name}`));
  console.log();

  // 7. Extract variables from a template
  console.log('7. Extracting variables from first template...');
  const template = templates[0];
  const variables = extractVariables(template);
  console.log(`Template: ${template.metadata.name}`);
  console.log(`Variables found: ${Array.from(variables).join(', ')}`);
  console.log();

  // 8. Display template variables
  console.log('8. Template variable definitions:');
  template.variables.forEach(v => {
    const required = v.required ? '(required)' : '(optional)';
    const defaultVal = v.default !== undefined ? ` [default: ${v.default}]` : '';
    console.log(`  - ${v.name} (${v.type}) ${required}${defaultVal}`);
    console.log(`    ${v.description}`);
  });
  console.log();

  // 9. Check prerequisites
  console.log('9. Checking prerequisites...');
  const missingPrereqs = checkPrerequisites(template, new Set());
  console.log(`Missing prerequisites: ${missingPrereqs.length}`);
  missingPrereqs.forEach(p => console.log(`  - ${p.type}: ${p.name}`));
  console.log();

  // 10. Instantiate the simple webhook template
  console.log('10. Instantiating Simple Webhook template...');
  try {
    const simpleTemplate = registry.getTemplate('simple-webhook-handler');
    const values: Record<string, unknown> = {
      webhookPath: 'my-webhook',
      responseMessage: 'Hello from n8n!',
      httpMethod: 'POST'
    };

    console.log('Using values:', JSON.stringify(values, null, 2));

    const result = instantiate(simpleTemplate, values);
    console.log('✓ Template instantiated successfully');
    console.log(`Workflow name: ${(result.workflow as { name?: string }).name}`);
    console.log(`Node count: ${((result.workflow as { nodes?: unknown[] }).nodes || []).length}`);
    console.log();

    // Show a snippet of the instantiated workflow
    console.log('11. Instantiated workflow snippet:');
    const workflowJson = JSON.stringify(result.workflow, null, 2);
    const lines = workflowJson.split('\n');
    console.log(lines.slice(0, 25).join('\n'));
    if (lines.length > 25) {
      console.log(`  ... (${lines.length - 25} more lines)`);
    }
    console.log();
  } catch (error) {
    console.log('✗ Failed to instantiate template:', error);
  }

  // 12. Demonstrate validation errors
  console.log('12. Testing validation with missing required variable...');
  try {
    const aiTemplate = registry.getTemplate('ai-chatbot-basic');
    const invalidValues = {
      webhookPath: 'chatbot',
      // Missing required openaiCredential
    };

    instantiate(aiTemplate, invalidValues);
    console.log('✗ Should have thrown validation error');
  } catch (error) {
    if (error instanceof Error) {
      console.log('✓ Validation correctly caught missing variable');
      console.log(`  Error: ${error.message.split('\n')[0]}`);
    }
  }

  console.log('\n=== Demo Complete ===');
}

main().catch(console.error);
