import type { Template, WorkflowAnalysis } from './types';
import { MarkdownGenerator } from './markdown';

/**
 * HTML Generator
 *
 * Generates static HTML documentation with navigation and search
 */

interface HTMLOptions {
	theme?: 'light' | 'dark' | 'auto';
	includeNavigation?: boolean;
	includeSearch?: boolean;
	customCSS?: string;
	customJS?: string;
	responsive?: boolean;
}

export class HTMLGenerator {
	private markdownGenerator: MarkdownGenerator;

	constructor() {
		this.markdownGenerator = new MarkdownGenerator();
	}

	/**
	 * Generate HTML documentation
	 */
	async generate(
		workflow: WorkflowAnalysis,
		template: string | Template,
		variables: Record<string, unknown> = {},
		options: HTMLOptions = {},
	): Promise<string> {
		const {
			theme = 'light',
			includeNavigation = true,
			includeSearch = true,
			customCSS = '',
			customJS = '',
			responsive = true,
		} = options;

		// Generate markdown first
		const markdown = await this.markdownGenerator.generate(workflow, template, variables);

		// Convert markdown to HTML
		const contentHTML = this.markdownToHTML(markdown);

		// Build complete HTML document
		return this.buildHTMLDocument(
			contentHTML,
			workflow,
			theme,
			includeNavigation,
			includeSearch,
			customCSS,
			customJS,
			responsive,
		);
	}

	/**
	 * Convert markdown to HTML
	 */
	private markdownToHTML(markdown: string): string {
		let html = markdown;

		// Headers
		html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
		html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
		html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

		// Bold
		html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

		// Italic
		html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

		// Inline code
		html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

		// Code blocks
		html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
			const language = lang || 'text';
			return `<pre><code class="language-${language}">${this.escapeHTML(code.trim())}</code></pre>`;
		});

		// Links
		html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

		// Unordered lists
		html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
		html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

		// Ordered lists
		html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');

		// Tables
		html = this.convertTables(html);

		// Paragraphs
		html = html.replace(/\n\n(.+?)\n\n/g, '<p>$1</p>');

		// Line breaks
		html = html.replace(/\n/g, '<br>');

		return html;
	}

	/**
	 * Convert markdown tables to HTML
	 */
	private convertTables(html: string): string {
		const tableRegex = /\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)+)/g;

		return html.replace(tableRegex, (match, header, body) => {
			const headers = header
				.split('|')
				.filter((h: string) => h.trim())
				.map((h: string) => `<th>${h.trim()}</th>`)
				.join('');

			const rows = body
				.trim()
				.split('\n')
				.map((row: string) => {
					const cells = row
						.split('|')
						.filter((c: string) => c.trim())
						.map((c: string) => `<td>${c.trim()}</td>`)
						.join('');
					return `<tr>${cells}</tr>`;
				})
				.join('');

			return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
		});
	}

	/**
	 * Escape HTML special characters
	 */
	private escapeHTML(text: string): string {
		const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;',
		};
		return text.replace(/[&<>"']/g, (char) => map[char]);
	}

	/**
	 * Build complete HTML document
	 */
	private buildHTMLDocument(
		contentHTML: string,
		workflow: WorkflowAnalysis,
		theme: string,
		includeNavigation: boolean,
		includeSearch: boolean,
		customCSS: string,
		customJS: string,
		responsive: boolean,
	): string {
		const navigation = includeNavigation ? this.generateNavigation(workflow) : '';
		const searchBar = includeSearch ? this.generateSearchBar() : '';
		const css = this.generateCSS(theme, responsive, customCSS);
		const js = this.generateJavaScript(includeSearch, customJS);

		return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${workflow.name} - Documentation</title>
    <meta name="description" content="${workflow.description || 'Workflow documentation'}">
    ${css}
</head>
<body>
    <div class="container">
        ${navigation}
        <main class="content">
            ${searchBar}
            ${contentHTML}
        </main>
    </div>
    ${js}
</body>
</html>`;
	}

	/**
	 * Generate navigation sidebar
	 */
	private generateNavigation(workflow: WorkflowAnalysis): string {
		return `
        <nav class="sidebar">
            <div class="sidebar-header">
                <h2>${workflow.name}</h2>
            </div>
            <div class="sidebar-nav">
                <ul>
                    <li><a href="#overview">Overview</a></li>
                    <li><a href="#configuration">Configuration</a></li>
                    <li><a href="#usage">Usage</a></li>
                    <li><a href="#troubleshooting">Troubleshooting</a></li>
                    <li><a href="#workflow-analysis">Analysis</a></li>
                </ul>
            </div>
        </nav>`;
	}

	/**
	 * Generate search bar
	 */
	private generateSearchBar(): string {
		return `
        <div class="search-container">
            <input type="search"
                   id="doc-search"
                   placeholder="Search documentation..."
                   aria-label="Search documentation">
            <div id="search-results"></div>
        </div>`;
	}

	/**
	 * Generate CSS styles
	 */
	private generateCSS(theme: string, responsive: boolean, customCSS: string): string {
		return `
    <style>
        :root {
            --primary-color: #5865f2;
            --secondary-color: #57f287;
            --background-color: #ffffff;
            --text-color: #2e3338;
            --sidebar-bg: #f6f6f7;
            --code-bg: #f0f0f0;
            --border-color: #e3e5e8;
        }

        [data-theme="dark"] {
            --background-color: #2b2d31;
            --text-color: #dbdee1;
            --sidebar-bg: #1e1f22;
            --code-bg: #383a40;
            --border-color: #3f4147;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: var(--background-color);
            color: var(--text-color);
            line-height: 1.6;
        }

        .container {
            display: flex;
            min-height: 100vh;
        }

        .sidebar {
            width: 280px;
            background-color: var(--sidebar-bg);
            border-right: 1px solid var(--border-color);
            padding: 2rem;
            position: fixed;
            height: 100vh;
            overflow-y: auto;
        }

        .sidebar-header h2 {
            color: var(--primary-color);
            margin-bottom: 1.5rem;
            font-size: 1.5rem;
        }

        .sidebar-nav ul {
            list-style: none;
        }

        .sidebar-nav li {
            margin-bottom: 0.5rem;
        }

        .sidebar-nav a {
            color: var(--text-color);
            text-decoration: none;
            padding: 0.5rem;
            display: block;
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .sidebar-nav a:hover {
            background-color: var(--code-bg);
        }

        .content {
            margin-left: 280px;
            padding: 2rem;
            max-width: 900px;
            width: 100%;
        }

        .search-container {
            margin-bottom: 2rem;
            position: sticky;
            top: 0;
            background-color: var(--background-color);
            padding: 1rem 0;
            z-index: 100;
        }

        #doc-search {
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background-color: var(--background-color);
            color: var(--text-color);
            font-size: 1rem;
        }

        #doc-search:focus {
            outline: none;
            border-color: var(--primary-color);
        }

        #search-results {
            margin-top: 0.5rem;
            background-color: var(--sidebar-bg);
            border-radius: 8px;
            display: none;
        }

        h1, h2, h3, h4, h5, h6 {
            margin-top: 2rem;
            margin-bottom: 1rem;
            color: var(--text-color);
        }

        h1 {
            font-size: 2.5rem;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 0.5rem;
        }

        h2 {
            font-size: 2rem;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.3rem;
        }

        h3 {
            font-size: 1.5rem;
        }

        p {
            margin-bottom: 1rem;
        }

        code {
            background-color: var(--code-bg);
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.9em;
        }

        pre {
            background-color: var(--code-bg);
            padding: 1rem;
            border-radius: 8px;
            overflow-x: auto;
            margin: 1rem 0;
        }

        pre code {
            background-color: transparent;
            padding: 0;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }

        th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }

        th {
            background-color: var(--sidebar-bg);
            font-weight: 600;
        }

        tr:hover {
            background-color: var(--sidebar-bg);
        }

        a {
            color: var(--primary-color);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        ul, ol {
            margin-left: 2rem;
            margin-bottom: 1rem;
        }

        li {
            margin-bottom: 0.5rem;
        }

        ${responsive ? this.getResponsiveCSS() : ''}
        ${customCSS}
    </style>`;
	}

	/**
	 * Get responsive CSS
	 */
	private getResponsiveCSS(): string {
		return `
        @media (max-width: 768px) {
            .sidebar {
                width: 100%;
                position: relative;
                height: auto;
            }

            .content {
                margin-left: 0;
            }
        }`;
	}

	/**
	 * Generate JavaScript
	 */
	private generateJavaScript(includeSearch: boolean, customJS: string): string {
		const searchJS = includeSearch
			? `
        // Simple search functionality
        const searchInput = document.getElementById('doc-search');
        const searchResults = document.getElementById('search-results');
        const content = document.querySelector('.content');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                if (query.length < 2) {
                    searchResults.style.display = 'none';
                    return;
                }

                const paragraphs = content.querySelectorAll('p, li, h1, h2, h3');
                const matches = [];

                paragraphs.forEach(el => {
                    const text = el.textContent.toLowerCase();
                    if (text.includes(query)) {
                        matches.push({
                            element: el,
                            text: el.textContent.substring(0, 100)
                        });
                    }
                });

                if (matches.length > 0) {
                    searchResults.innerHTML = matches.slice(0, 5).map(match =>
                        '<div style="padding: 0.5rem; cursor: pointer;">' + match.text + '...</div>'
                    ).join('');
                    searchResults.style.display = 'block';
                } else {
                    searchResults.style.display = 'none';
                }
            });
        }

        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
        `
			: '';

		return `
    <script>
        ${searchJS}
        ${customJS}
    </script>`;
	}

	/**
	 * Generate static site with multiple pages
	 */
	async generateSite(
		workflows: WorkflowAnalysis[],
		template: string | Template,
		options: HTMLOptions = {},
	): Promise<Map<string, string>> {
		const pages = new Map<string, string>();

		// Generate index page
		const indexHTML = this.generateIndexPage(workflows, options);
		pages.set('index.html', indexHTML);

		// Generate individual workflow pages
		for (const workflow of workflows) {
			const workflowHTML = await this.generate(workflow, template, {}, options);
			pages.set(`${workflow.workflowId}.html`, workflowHTML);
		}

		return pages;
	}

	/**
	 * Generate index page listing all workflows
	 */
	private generateIndexPage(workflows: WorkflowAnalysis[], options: HTMLOptions): string {
		const css = this.generateCSS(options.theme || 'light', true, options.customCSS || '');

		const workflowList = workflows
			.map(
				(w) => `
            <div class="workflow-card">
                <h3><a href="${w.workflowId}.html">${w.name}</a></h3>
                <p>${w.description || 'No description'}</p>
                <div class="workflow-stats">
                    <span>${w.nodes.length} nodes</span>
                    <span>${w.connections.length} connections</span>
                </div>
            </div>
        `,
			)
			.join('');

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Documentation</title>
    ${css}
    <style>
        .workflow-card {
            background-color: var(--sidebar-bg);
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            border: 1px solid var(--border-color);
        }
        .workflow-stats {
            margin-top: 0.5rem;
            color: var(--text-color);
            opacity: 0.7;
        }
        .workflow-stats span {
            margin-right: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <main class="content">
            <h1>Workflow Documentation</h1>
            <p>Browse documentation for all workflows.</p>
            ${workflowList}
        </main>
    </div>
</body>
</html>`;
	}
}
