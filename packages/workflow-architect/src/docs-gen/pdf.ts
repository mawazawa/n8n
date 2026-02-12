import type { WorkflowAnalysis, ExportOptions } from './types';
import { HTMLGenerator } from './html';

/**
 * PDF Generator
 *
 * Generates PDF documents from workflow documentation
 * Note: This is a simplified implementation. In production, use libraries like:
 * - puppeteer (headless Chrome)
 * - pdfkit
 * - jsPDF
 */

interface PDFMetadata {
	title: string;
	author?: string;
	subject?: string;
	keywords?: string[];
	creator: string;
	producer: string;
}

export class PDFGenerator {
	private htmlGenerator: HTMLGenerator;

	constructor() {
		this.htmlGenerator = new HTMLGenerator();
	}

	/**
	 * Generate PDF from workflow
	 */
	async generate(
		workflow: WorkflowAnalysis,
		template: string,
		options: ExportOptions,
	): Promise<Buffer> {
		// Generate HTML first
		const html = await this.htmlGenerator.generate(workflow, template, {}, {
			theme: options.theme || 'light',
			includeNavigation: false, // Don't include navigation in PDF
			includeSearch: false, // Don't include search in PDF
			responsive: false,
		});

		// Add PDF-specific styling
		const pdfHTML = this.addPDFStyling(html, options);

		// Convert to PDF (simplified - in production use puppeteer or similar)
		const pdf = await this.htmlToPDF(pdfHTML, options);

		return pdf;
	}

	/**
	 * Add PDF-specific styling
	 */
	private addPDFStyling(html: string, options: ExportOptions): string {
		const {
			pageSize = 'A4',
			orientation = 'portrait',
			margins = { top: 20, bottom: 20, left: 20, right: 20 },
			headerTemplate,
			footerTemplate,
		} = options;

		const pdfStyles = `
        <style>
            @page {
                size: ${pageSize} ${orientation};
                margin-top: ${margins.top}mm;
                margin-bottom: ${margins.bottom}mm;
                margin-left: ${margins.left}mm;
                margin-right: ${margins.right}mm;

                @top-center {
                    content: ${headerTemplate ? `"${headerTemplate}"` : 'none'};
                }

                @bottom-center {
                    content: ${footerTemplate ? `"${footerTemplate}"` : 'counter(page)'};
                }
            }

            body {
                font-family: 'Times New Roman', serif;
                font-size: 12pt;
                line-height: 1.5;
            }

            h1 {
                page-break-before: always;
                page-break-after: avoid;
            }

            h2, h3 {
                page-break-after: avoid;
            }

            table, figure {
                page-break-inside: avoid;
            }

            pre {
                page-break-inside: avoid;
                white-space: pre-wrap;
            }

            .toc {
                page-break-after: always;
            }

            .page-break {
                page-break-after: always;
            }
        </style>`;

		// Insert PDF styles before closing head tag
		return html.replace('</head>', `${pdfStyles}</head>`);
	}

	/**
	 * Convert HTML to PDF
	 * This is a placeholder - in production, integrate with a proper PDF library
	 */
	private async htmlToPDF(html: string, options: ExportOptions): Promise<Buffer> {
		// In a real implementation, you would use:
		// 1. Puppeteer to render HTML and generate PDF
		// 2. Or use a dedicated PDF generation library

		// Placeholder implementation that returns a simple PDF structure
		const metadata = this.generatePDFMetadata(options);

		// This is a simplified PDF structure
		// In production, use proper PDF generation
		const pdfContent = this.createSimplePDF(html, metadata);

		return Buffer.from(pdfContent, 'binary');
	}

	/**
	 * Generate PDF metadata
	 */
	private generatePDFMetadata(options: ExportOptions): PDFMetadata {
		return {
			title: 'Workflow Documentation',
			author: 'Workflow Architect',
			subject: 'Automated Workflow Documentation',
			keywords: ['workflow', 'documentation', 'n8n'],
			creator: 'Workflow Architect PDF Generator',
			producer: 'Workflow Architect v1.0',
		};
	}

	/**
	 * Create a simple PDF structure
	 * Note: This is a placeholder. Use a proper PDF library in production.
	 */
	private createSimplePDF(html: string, metadata: PDFMetadata): string {
		// This creates a minimal PDF structure
		// In production, use puppeteer, pdfkit, or jsPDF

		const pdfHeader = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
/Metadata <<
  /Title (${metadata.title})
  /Author (${metadata.author || ''})
  /Subject (${metadata.subject || ''})
  /Creator (${metadata.creator})
  /Producer (${metadata.producer})
>>
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
  /Font <<
    /F1 <<
      /Type /Font
      /Subtype /Type1
      /BaseFont /Times-Roman
    >>
  >>
>>
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length ${html.length}
>>
stream
${this.htmlToPlainText(html)}
endstream
endobj

xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000200 00000 n
0000000260 00000 n
0000000450 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
${500 + html.length}
%%EOF`;

		return pdfHeader;
	}

	/**
	 * Convert HTML to plain text for simple PDF
	 */
	private htmlToPlainText(html: string): string {
		return html
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
			.replace(/<[^>]+>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.trim();
	}

	/**
	 * Generate PDF with advanced features using puppeteer
	 * This would be the recommended production implementation
	 */
	async generateWithPuppeteer(
		workflow: WorkflowAnalysis,
		template: string,
		options: ExportOptions,
	): Promise<Buffer> {
		// Example implementation with puppeteer (requires puppeteer package)
		/*
		const puppeteer = require('puppeteer');
		const browser = await puppeteer.launch();
		const page = await browser.newPage();

		const html = await this.htmlGenerator.generate(workflow, template);
		await page.setContent(html);

		const pdf = await page.pdf({
			format: options.pageSize || 'A4',
			landscape: options.orientation === 'landscape',
			margin: options.margins || {
				top: '20mm',
				bottom: '20mm',
				left: '20mm',
				right: '20mm'
			},
			displayHeaderFooter: true,
			headerTemplate: options.headerTemplate || '',
			footerTemplate: options.footerTemplate ||
				'<div style="font-size: 10px; text-align: center; width: 100%;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
			printBackground: true
		});

		await browser.close();
		return pdf;
		*/

		// Placeholder - return simple PDF for now
		return this.generate(workflow, template, options);
	}

	/**
	 * Generate table of contents with page numbers
	 */
	private generateTableOfContents(html: string): string {
		const headings: Array<{ level: number; title: string; page: number }> = [];

		// Extract headings (simplified)
		const headingRegex = /<h([1-3])>(.*?)<\/h\1>/g;
		let match;
		let pageCount = 1;
		let charCount = 0;
		const charsPerPage = 2000; // Approximate

		while ((match = headingRegex.exec(html)) !== null) {
			charCount += match.index - charCount;
			const currentPage = Math.ceil(charCount / charsPerPage);

			headings.push({
				level: parseInt(match[1]),
				title: match[2],
				page: currentPage,
			});
		}

		// Generate TOC HTML
		const tocItems = headings
			.map((h) => {
				const indent = '  '.repeat(h.level - 1);
				return `${indent}${h.title} ................... ${h.page}`;
			})
			.join('\n');

		return `<div class="toc">
<h1>Table of Contents</h1>
<pre>${tocItems}</pre>
</div>`;
	}

	/**
	 * Add page numbers to PDF
	 */
	private addPageNumbers(html: string, format: string = 'Page {page} of {total}'): string {
		// This would be handled by the PDF library in production
		const footer = `
        <div class="pdf-footer">
            ${format.replace('{page}', '<span class="page-number"></span>').replace('{total}', '<span class="total-pages"></span>')}
        </div>`;

		return html.replace('</body>', `${footer}</body>`);
	}

	/**
	 * Add headers and footers
	 */
	private addHeadersFooters(
		html: string,
		headerTemplate?: string,
		footerTemplate?: string,
	): string {
		let result = html;

		if (headerTemplate) {
			const header = `<div class="pdf-header">${headerTemplate}</div>`;
			result = result.replace('<body>', `<body>${header}`);
		}

		if (footerTemplate) {
			const footer = `<div class="pdf-footer">${footerTemplate}</div>`;
			result = result.replace('</body>', `${footer}</body>`);
		}

		return result;
	}

	/**
	 * Batch generate PDFs for multiple workflows
	 */
	async generateBatch(
		workflows: WorkflowAnalysis[],
		template: string,
		options: ExportOptions,
	): Promise<Map<string, Buffer>> {
		const pdfs = new Map<string, Buffer>();

		for (const workflow of workflows) {
			const pdf = await this.generate(workflow, template, options);
			pdfs.set(workflow.workflowId, pdf);
		}

		return pdfs;
	}

	/**
	 * Generate combined PDF for multiple workflows
	 */
	async generateCombined(
		workflows: WorkflowAnalysis[],
		template: string,
		options: ExportOptions,
	): Promise<Buffer> {
		// Generate HTML for all workflows
		const htmlPages: string[] = [];

		for (const workflow of workflows) {
			const html = await this.htmlGenerator.generate(workflow, template);
			htmlPages.push(html);
		}

		// Combine HTML pages
		const combinedHTML = htmlPages.join('<div class="page-break"></div>');

		// Add PDF styling and convert
		const pdfHTML = this.addPDFStyling(combinedHTML, options);
		return this.htmlToPDF(pdfHTML, options);
	}
}
