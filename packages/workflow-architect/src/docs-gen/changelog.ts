import type { Changelog, ChangelogEntry } from './types';
import { ChangelogEntrySchema } from './types';

/**
 * Changelog Generator
 *
 * Generates changelogs from version history
 */

interface WorkflowVersion {
	version: string;
	date: Date;
	changes: string[];
	author?: string;
	notes?: string;
}

export class ChangelogGenerator {
	/**
	 * Generate changelog from version history
	 */
	generate(
		projectName: string,
		versions: WorkflowVersion[],
		options: { groupByType?: boolean; format?: 'markdown' | 'json' } = {},
	): Changelog {
		const { groupByType = true, format = 'markdown' } = options;

		const entries = versions.map((version) => this.createEntry(version));

		return {
			projectName,
			entries,
			format: format === 'markdown' ? 'markdown' : 'json',
			groupByType,
		};
	}

	/**
	 * Create changelog entry from version
	 */
	private createEntry(version: WorkflowVersion): ChangelogEntry {
		const entry: ChangelogEntry = {
			version: version.version,
			date: version.date,
			changes: version.changes.map((change) => this.parseChange(change)),
			author: version.author,
			releaseNotes: version.notes,
		};

		return ChangelogEntrySchema.parse(entry);
	}

	/**
	 * Parse change string to categorized change
	 */
	private parseChange(change: string): ChangelogEntry['changes'][0] {
		// Detect change type from prefix or content
		const changeObj: ChangelogEntry['changes'][0] = {
			type: 'changed',
			description: change,
			breaking: false,
		};

		const lowerChange = change.toLowerCase();

		if (lowerChange.startsWith('add') || lowerChange.includes('new')) {
			changeObj.type = 'added';
		} else if (lowerChange.startsWith('fix') || lowerChange.includes('bug')) {
			changeObj.type = 'fixed';
		} else if (lowerChange.startsWith('remove') || lowerChange.includes('delete')) {
			changeObj.type = 'removed';
		} else if (lowerChange.includes('deprecat')) {
			changeObj.type = 'deprecated';
		} else if (lowerChange.includes('security') || lowerChange.includes('vulnerability')) {
			changeObj.type = 'security';
		}

		// Detect breaking changes
		if (
			lowerChange.includes('breaking') ||
			lowerChange.includes('incompatible') ||
			lowerChange.startsWith('!')
		) {
			changeObj.breaking = true;

			// Extract migration guide if present
			const migrationMatch = change.match(/Migration: (.+)/i);
			if (migrationMatch) {
				changeObj.migrationGuide = migrationMatch[1];
			}
		}

		return changeObj;
	}

	/**
	 * Export changelog to markdown
	 */
	exportToMarkdown(changelog: Changelog): string {
		const lines: string[] = [];

		lines.push(`# ${changelog.projectName} Changelog`);
		lines.push('');
		lines.push(
			'All notable changes to this project will be documented in this file.',
		);
		lines.push('');
		lines.push(
			'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),',
		);
		lines.push(
			'and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).',
		);
		lines.push('');

		// Sort entries by date (newest first)
		const sortedEntries = [...changelog.entries].sort(
			(a, b) => b.date.getTime() - a.date.getTime(),
		);

		for (const entry of sortedEntries) {
			lines.push(this.formatEntry(entry, changelog.groupByType));
			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Format a single changelog entry
	 */
	private formatEntry(entry: ChangelogEntry, groupByType: boolean): string {
		const lines: string[] = [];

		// Version header
		lines.push(`## [${entry.version}] - ${this.formatDate(entry.date)}`);
		lines.push('');

		// Release notes
		if (entry.releaseNotes) {
			lines.push(entry.releaseNotes);
			lines.push('');
		}

		// Author
		if (entry.author) {
			lines.push(`*Released by ${entry.author}*`);
			lines.push('');
		}

		if (groupByType) {
			// Group changes by type
			const groupedChanges = this.groupChangesByType(entry.changes);

			for (const [type, changes] of Object.entries(groupedChanges)) {
				if (changes.length > 0) {
					lines.push(`### ${this.formatChangeType(type)}`);
					lines.push('');

					for (const change of changes) {
						const prefix = change.breaking ? '**[BREAKING]** ' : '';
						lines.push(`- ${prefix}${change.description}`);

						if (change.migrationGuide) {
							lines.push(`  - *Migration: ${change.migrationGuide}*`);
						}
					}

					lines.push('');
				}
			}
		} else {
			// List all changes together
			for (const change of entry.changes) {
				const prefix = change.breaking ? '**[BREAKING]** ' : '';
				const typeLabel = `**${this.formatChangeType(change.type)}:** `;
				lines.push(`- ${prefix}${typeLabel}${change.description}`);

				if (change.migrationGuide) {
					lines.push(`  - *Migration: ${change.migrationGuide}*`);
				}
			}
		}

		return lines.join('\n');
	}

	/**
	 * Group changes by type
	 */
	private groupChangesByType(
		changes: ChangelogEntry['changes'],
	): Record<string, ChangelogEntry['changes']> {
		const groups: Record<string, ChangelogEntry['changes']> = {
			added: [],
			changed: [],
			deprecated: [],
			removed: [],
			fixed: [],
			security: [],
		};

		for (const change of changes) {
			groups[change.type].push(change);
		}

		return groups;
	}

	/**
	 * Format change type for display
	 */
	private formatChangeType(type: string): string {
		const types: Record<string, string> = {
			added: 'Added',
			changed: 'Changed',
			deprecated: 'Deprecated',
			removed: 'Removed',
			fixed: 'Fixed',
			security: 'Security',
		};

		return types[type] || type;
	}

	/**
	 * Format date
	 */
	private formatDate(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	/**
	 * Export changelog to JSON
	 */
	exportToJSON(changelog: Changelog): string {
		return JSON.stringify(changelog, null, 2);
	}

	/**
	 * Export changelog to HTML
	 */
	exportToHTML(changelog: Changelog): string {
		const markdown = this.exportToMarkdown(changelog);

		// Simple markdown to HTML conversion
		let html = markdown;

		// Headers
		html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
		html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');

		// Bold
		html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

		// Italic
		html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

		// Lists
		html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
		html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

		// Links
		html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

		// Paragraphs
		html = html.replace(/\n\n/g, '</p><p>');
		html = `<p>${html}</p>`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${changelog.projectName} - Changelog</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
        }
        h2 {
            border-bottom: 2px solid #e1e4e8;
            padding-bottom: 0.3rem;
            margin-top: 2rem;
        }
        h3 {
            margin-top: 1.5rem;
        }
        ul {
            list-style-type: none;
            padding-left: 0;
        }
        li {
            margin-bottom: 0.5rem;
            padding-left: 1.5rem;
            position: relative;
        }
        li:before {
            content: "•";
            position: absolute;
            left: 0;
        }
        strong {
            color: #d73a49;
        }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;
	}

	/**
	 * Generate changelog from git history
	 */
	async generateFromGit(
		projectName: string,
		gitLogOutput: string,
	): Promise<Changelog> {
		const versions = this.parseGitLog(gitLogOutput);
		return this.generate(projectName, versions);
	}

	/**
	 * Parse git log output
	 */
	private parseGitLog(gitLog: string): WorkflowVersion[] {
		const versions: WorkflowVersion[] = [];
		const commits = gitLog.split('\n\n');

		let currentVersion = '0.1.0';
		const changes: string[] = [];

		for (const commit of commits) {
			if (!commit.trim()) continue;

			// Check for version tag
			const versionMatch = commit.match(/tag: v?(\d+\.\d+\.\d+)/);
			if (versionMatch) {
				if (changes.length > 0) {
					versions.push({
						version: currentVersion,
						date: new Date(),
						changes: [...changes],
					});
					changes.length = 0;
				}
				currentVersion = versionMatch[1];
			}

			// Extract commit message
			const messageMatch = commit.match(/\s+(.+)$/m);
			if (messageMatch) {
				changes.push(messageMatch[1]);
			}
		}

		// Add final version
		if (changes.length > 0) {
			versions.push({
				version: currentVersion,
				date: new Date(),
				changes,
			});
		}

		return versions;
	}

	/**
	 * Generate semantic version bump suggestion
	 */
	suggestVersionBump(changes: ChangelogEntry['changes']): 'major' | 'minor' | 'patch' {
		// Major: breaking changes
		if (changes.some((c) => c.breaking)) {
			return 'major';
		}

		// Minor: new features
		if (changes.some((c) => c.type === 'added')) {
			return 'minor';
		}

		// Patch: bug fixes and other changes
		return 'patch';
	}

	/**
	 * Calculate next version based on changes
	 */
	calculateNextVersion(
		currentVersion: string,
		changes: ChangelogEntry['changes'],
	): string {
		const bump = this.suggestVersionBump(changes);
		const [major, minor, patch] = currentVersion.split('.').map(Number);

		switch (bump) {
			case 'major':
				return `${major + 1}.0.0`;
			case 'minor':
				return `${major}.${minor + 1}.0`;
			case 'patch':
				return `${major}.${minor}.${patch + 1}`;
		}
	}

	/**
	 * Highlight breaking changes
	 */
	getBreakingChanges(changelog: Changelog): Array<{
		version: string;
		changes: ChangelogEntry['changes'];
	}> {
		const breakingChanges: Array<{
			version: string;
			changes: ChangelogEntry['changes'];
		}> = [];

		for (const entry of changelog.entries) {
			const breaking = entry.changes.filter((c) => c.breaking);
			if (breaking.length > 0) {
				breakingChanges.push({
					version: entry.version,
					changes: breaking,
				});
			}
		}

		return breakingChanges;
	}

	/**
	 * Generate migration guide for breaking changes
	 */
	generateMigrationGuide(changelog: Changelog): string {
		const lines: string[] = [];

		lines.push(`# ${changelog.projectName} - Migration Guide`);
		lines.push('');
		lines.push('This guide helps you migrate between major versions with breaking changes.');
		lines.push('');

		const breakingChanges = this.getBreakingChanges(changelog);

		for (const { version, changes } of breakingChanges) {
			lines.push(`## Migrating to ${version}`);
			lines.push('');

			for (const change of changes) {
				lines.push(`### ${change.description}`);
				lines.push('');

				if (change.migrationGuide) {
					lines.push(change.migrationGuide);
				} else {
					lines.push('Please review the changelog for details on this breaking change.');
				}

				lines.push('');
			}
		}

		return lines.join('\n');
	}
}
