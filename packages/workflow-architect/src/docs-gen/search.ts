import type { Document, SearchResult, DocumentIndex, IndexEntry } from './types';
import { SearchResultSchema } from './types';

/**
 * Documentation Search
 *
 * Full-text search with fuzzy matching and relevance ranking
 */

interface SearchOptions {
	fuzzy?: boolean;
	maxResults?: number;
	threshold?: number;
	caseSensitive?: boolean;
}

export class DocSearch {
	private index: Map<string, IndexEntry[]> = new Map();
	private documents: Map<string, Document> = new Map();
	private stopWords = new Set([
		'a',
		'an',
		'and',
		'are',
		'as',
		'at',
		'be',
		'by',
		'for',
		'from',
		'has',
		'he',
		'in',
		'is',
		'it',
		'its',
		'of',
		'on',
		'that',
		'the',
		'to',
		'was',
		'will',
		'with',
	]);

	/**
	 * Index a collection of documents
	 */
	async index(documents: Document[]): Promise<void> {
		this.index.clear();
		this.documents.clear();

		for (const doc of documents) {
			this.indexDocument(doc);
		}
	}

	/**
	 * Index a single document
	 */
	private indexDocument(doc: Document): void {
		this.documents.set(doc.id, doc);

		// Index metadata
		this.indexText(doc.id, '', doc.metadata.title, 10);
		if (doc.metadata.description) {
			this.indexText(doc.id, '', doc.metadata.description, 5);
		}

		// Index sections
		for (const section of doc.sections) {
			this.indexSection(doc.id, section);
		}
	}

	/**
	 * Index a section
	 */
	private indexSection(documentId: string, section: Document['sections'][0]): void {
		// Index section title
		this.indexText(documentId, section.id, section.title, 8);

		// Index section content
		this.indexText(documentId, section.id, section.content, 1);

		// Index examples
		for (const example of section.examples) {
			this.indexText(documentId, section.id, example.title, 3);
			if (example.description) {
				this.indexText(documentId, section.id, example.description, 2);
			}
		}

		// Index subsections
		for (const subsection of section.subsections) {
			this.indexSection(documentId, subsection);
		}
	}

	/**
	 * Index text content
	 */
	private indexText(
		documentId: string,
		sectionId: string,
		text: string,
		boost: number = 1,
	): void {
		const terms = this.tokenize(text);

		for (const term of terms) {
			if (this.stopWords.has(term)) continue;

			if (!this.index.has(term)) {
				this.index.set(term, []);
			}

			const entries = this.index.get(term)!;
			const existingEntry = entries.find(
				(e) => e.documentId === documentId && e.sectionId === sectionId,
			);

			if (existingEntry) {
				existingEntry.frequency += boost;
			} else {
				entries.push({
					term,
					documentId,
					sectionId,
					frequency: boost,
				});
			}
		}
	}

	/**
	 * Tokenize text into searchable terms
	 */
	private tokenize(text: string): string[] {
		return text
			.toLowerCase()
			.replace(/[^\w\s]/g, ' ')
			.split(/\s+/)
			.filter((term) => term.length > 2);
	}

	/**
	 * Search documents
	 */
	async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
		const { fuzzy = true, maxResults = 10, threshold = 0.1, caseSensitive = false } = options;

		const queryTerms = this.tokenize(caseSensitive ? query : query.toLowerCase());

		if (queryTerms.length === 0) {
			return [];
		}

		// Find matching documents
		const matches = new Map<string, { score: number; sections: Set<string> }>();

		for (const queryTerm of queryTerms) {
			const termMatches = fuzzy ? this.fuzzySearch(queryTerm) : this.exactSearch(queryTerm);

			for (const entry of termMatches) {
				const key = entry.documentId;

				if (!matches.has(key)) {
					matches.set(key, { score: 0, sections: new Set() });
				}

				const match = matches.get(key)!;
				match.score += entry.frequency;
				if (entry.sectionId) {
					match.sections.add(entry.sectionId);
				}
			}
		}

		// Convert to search results
		const results: SearchResult[] = [];

		for (const [documentId, match] of matches.entries()) {
			const doc = this.documents.get(documentId);
			if (!doc) continue;

			// Calculate relevance score
			const relevanceScore = match.score / (queryTerms.length * 10);

			if (relevanceScore < threshold) continue;

			// Generate snippet
			const snippet = this.generateSnippet(doc, match.sections, queryTerms);

			// Generate highlights
			const highlights = this.generateHighlights(doc, queryTerms);

			results.push(
				SearchResultSchema.parse({
					documentId,
					title: doc.metadata.title,
					snippet,
					relevanceScore,
					highlights,
					metadata: {
						version: doc.metadata.version,
						tags: doc.metadata.tags,
					},
				}),
			);
		}

		// Sort by relevance and limit
		return results
			.sort((a, b) => b.relevanceScore - a.relevanceScore)
			.slice(0, maxResults);
	}

	/**
	 * Exact term search
	 */
	private exactSearch(term: string): IndexEntry[] {
		return this.index.get(term) || [];
	}

	/**
	 * Fuzzy term search
	 */
	private fuzzySearch(term: string): IndexEntry[] {
		const matches: IndexEntry[] = [];

		for (const [indexedTerm, entries] of this.index.entries()) {
			const similarity = this.calculateSimilarity(term, indexedTerm);

			if (similarity > 0.7) {
				// Adjust score based on similarity
				const adjustedEntries = entries.map((entry) => ({
					...entry,
					frequency: entry.frequency * similarity,
				}));
				matches.push(...adjustedEntries);
			}
		}

		return matches;
	}

	/**
	 * Calculate string similarity (Levenshtein distance)
	 */
	private calculateSimilarity(str1: string, str2: string): number {
		const len1 = str1.length;
		const len2 = str2.length;

		const matrix: number[][] = Array(len1 + 1)
			.fill(null)
			.map(() => Array(len2 + 1).fill(0));

		for (let i = 0; i <= len1; i++) matrix[i][0] = i;
		for (let j = 0; j <= len2; j++) matrix[0][j] = j;

		for (let i = 1; i <= len1; i++) {
			for (let j = 1; j <= len2; j++) {
				const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(
					matrix[i - 1][j] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j - 1] + cost,
				);
			}
		}

		const distance = matrix[len1][len2];
		const maxLen = Math.max(len1, len2);

		return 1 - distance / maxLen;
	}

	/**
	 * Generate snippet from document
	 */
	private generateSnippet(
		doc: Document,
		sections: Set<string>,
		queryTerms: string[],
	): string {
		// Try to find snippet from matching sections
		for (const sectionId of sections) {
			const section = this.findSection(doc.sections, sectionId);
			if (section) {
				const snippet = this.extractSnippet(section.content, queryTerms);
				if (snippet) return snippet;
			}
		}

		// Fall back to description or first section
		if (doc.metadata.description) {
			return this.truncate(doc.metadata.description, 150);
		}

		if (doc.sections.length > 0) {
			return this.extractSnippet(doc.sections[0].content, queryTerms);
		}

		return '';
	}

	/**
	 * Find section by ID
	 */
	private findSection(
		sections: Document['sections'],
		sectionId: string,
	): Document['sections'][0] | null {
		for (const section of sections) {
			if (section.id === sectionId) return section;

			const found = this.findSection(section.subsections, sectionId);
			if (found) return found;
		}

		return null;
	}

	/**
	 * Extract snippet containing query terms
	 */
	private extractSnippet(text: string, queryTerms: string[]): string {
		const sentences = text.split(/[.!?]\s+/);

		// Find sentence containing most query terms
		let bestSentence = '';
		let maxMatches = 0;

		for (const sentence of sentences) {
			const lowerSentence = sentence.toLowerCase();
			const matches = queryTerms.filter((term) => lowerSentence.includes(term)).length;

			if (matches > maxMatches) {
				maxMatches = matches;
				bestSentence = sentence;
			}
		}

		return this.truncate(bestSentence || sentences[0] || text, 150);
	}

	/**
	 * Truncate text to max length
	 */
	private truncate(text: string, maxLength: number): string {
		if (text.length <= maxLength) return text;

		const truncated = text.substring(0, maxLength);
		const lastSpace = truncated.lastIndexOf(' ');

		return truncated.substring(0, lastSpace > 0 ? lastSpace : maxLength) + '...';
	}

	/**
	 * Generate highlights for query terms
	 */
	private generateHighlights(doc: Document, queryTerms: string[]): string[] {
		const highlights: string[] = [];

		const searchText = [
			doc.metadata.title,
			doc.metadata.description || '',
			...doc.sections.map((s) => s.content),
		].join(' ');

		const lowerText = searchText.toLowerCase();

		for (const term of queryTerms) {
			const index = lowerText.indexOf(term);
			if (index !== -1) {
				const start = Math.max(0, index - 30);
				const end = Math.min(searchText.length, index + term.length + 30);
				highlights.push('...' + searchText.substring(start, end) + '...');
			}
		}

		return highlights.slice(0, 3); // Limit to 3 highlights
	}

	/**
	 * Get search suggestions
	 */
	async suggest(partial: string, limit: number = 5): Promise<string[]> {
		const partialLower = partial.toLowerCase();
		const suggestions: Set<string> = new Set();

		for (const term of this.index.keys()) {
			if (term.startsWith(partialLower)) {
				suggestions.add(term);
			}

			if (suggestions.size >= limit) break;
		}

		return Array.from(suggestions);
	}

	/**
	 * Get index statistics
	 */
	getIndexStats(): DocumentIndex['metadata'] {
		return {
			totalDocuments: this.documents.size,
			totalTerms: this.index.size,
			lastUpdated: new Date(),
		};
	}

	/**
	 * Clear the index
	 */
	clear(): void {
		this.index.clear();
		this.documents.clear();
	}

	/**
	 * Export index to JSON
	 */
	exportIndex(): DocumentIndex {
		const entries: IndexEntry[] = [];

		for (const [term, indexEntries] of this.index.entries()) {
			entries.push(...indexEntries);
		}

		return {
			entries,
			metadata: this.getIndexStats(),
		};
	}

	/**
	 * Import index from JSON
	 */
	importIndex(indexData: DocumentIndex, documents: Document[]): void {
		this.clear();

		// Rebuild index from entries
		for (const entry of indexData.entries) {
			if (!this.index.has(entry.term)) {
				this.index.set(entry.term, []);
			}
			this.index.get(entry.term)!.push(entry);
		}

		// Store documents
		for (const doc of documents) {
			this.documents.set(doc.id, doc);
		}
	}

	/**
	 * Reindex a specific document
	 */
	async reindexDocument(documentId: string, document: Document): Promise<void> {
		// Remove existing entries for this document
		for (const [term, entries] of this.index.entries()) {
			const filtered = entries.filter((e) => e.documentId !== documentId);
			if (filtered.length === 0) {
				this.index.delete(term);
			} else {
				this.index.set(term, filtered);
			}
		}

		// Reindex the document
		this.indexDocument(document);
	}
}
