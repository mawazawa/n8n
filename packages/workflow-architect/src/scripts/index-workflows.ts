#!/usr/bin/env tsx
/**
 * Index Workflows Script
 * Indexes all workflow JSON files into the RAG store
 */

import { WorkflowRAGStore } from '../rag/store.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🔍 Indexing workflow examples...\n');

  const store = new WorkflowRAGStore({
    workflowsPath: join(__dirname, '../../../workflows'),
    indexPath: join(__dirname, '../../.cache/rag-index.json'),
  });

  try {
    const count = await store.indexWorkflows();
    console.log(`\n✅ Indexed ${count} workflows`);

    // Print stats
    const stats = store.getStats();
    console.log('\n📊 Statistics:');
    console.log(`   Total examples: ${stats.total}`);
    console.log(`   Categories:`);
    for (const [category, count] of Object.entries(stats.byCategory)) {
      console.log(`     - ${category}: ${count}`);
    }
    console.log(`   Techniques: ${stats.techniques.slice(0, 10).join(', ')}...`);

    // Test search
    console.log('\n🔎 Test search for "slack notification":');
    const results = store.search('send a slack notification', { limit: 3 });
    for (const result of results) {
      console.log(`   - ${result.name}: ${result.description.slice(0, 60)}...`);
    }

  } catch (error) {
    console.error('❌ Error indexing workflows:', error);
    process.exit(1);
  }
}

main();
