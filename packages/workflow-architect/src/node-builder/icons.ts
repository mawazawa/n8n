/**
 * Custom Node Builder - Icon Management
 * Handle icons for custom nodes
 */

import type { IconData, IconConfig } from './types';

/**
 * Icon manager class
 */
export class IconManager {
	/**
	 * Load icon from URL
	 */
	async fromUrl(url: string): Promise<IconData> {
		try {
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`Failed to fetch icon: ${response.statusText}`);
			}

			const contentType = response.headers.get('content-type') || '';
			let format: 'svg' | 'png' | 'jpg';

			if (contentType.includes('svg')) {
				format = 'svg';
			} else if (contentType.includes('png')) {
				format = 'png';
			} else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
				format = 'jpg';
			} else {
				throw new Error(`Unsupported icon format: ${contentType}`);
			}

			const data = format === 'svg' ? await response.text() : await response.arrayBuffer();

			return {
				format,
				data: format === 'svg' ? data as string : Buffer.from(data),
			};
		} catch (error) {
			throw new Error(
				`Failed to load icon from URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	/**
	 * Create icon from SVG string
	 */
	fromSvg(svg: string): IconData {
		// Basic SVG validation
		if (!svg.trim().startsWith('<svg')) {
			throw new Error('Invalid SVG: must start with <svg> tag');
		}

		return {
			format: 'svg',
			data: svg,
		};
	}

	/**
	 * Create icon from emoji
	 */
	fromEmoji(emoji: string): IconData {
		// Convert emoji to SVG
		const svg = this.emojiToSvg(emoji);

		return {
			format: 'svg',
			data: svg,
		};
	}

	/**
	 * Optimize icon data
	 */
	optimize(iconData: IconData): IconData {
		if (iconData.format === 'svg' && typeof iconData.data === 'string') {
			// Basic SVG optimization
			let optimized = iconData.data;

			// Remove comments
			optimized = optimized.replace(/<!--[\s\S]*?-->/g, '');

			// Remove unnecessary whitespace
			optimized = optimized.replace(/\s+/g, ' ');

			// Remove metadata
			optimized = optimized.replace(/<metadata>[\s\S]*?<\/metadata>/gi, '');

			return {
				...iconData,
				data: optimized.trim(),
				optimized: true,
			};
		}

		return iconData;
	}

	/**
	 * Resize icon (placeholder - would need image processing library)
	 */
	resize(iconData: IconData, width: number, height: number): IconData {
		if (iconData.format === 'svg' && typeof iconData.data === 'string') {
			// For SVG, just update viewBox
			let svg = iconData.data;

			// Set width and height
			svg = svg.replace(/width="[^"]*"/, `width="${width}"`);
			svg = svg.replace(/height="[^"]*"/, `height="${height}"`);

			// If no width/height, add them
			if (!svg.includes('width=')) {
				svg = svg.replace('<svg', `<svg width="${width}" height="${height}"`);
			}

			return {
				...iconData,
				data: svg,
				width,
				height,
			};
		}

		// For raster formats, would need image processing library
		return iconData;
	}

	/**
	 * Convert emoji to SVG (simple implementation)
	 */
	private emojiToSvg(emoji: string): string {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
				<text x="50%" y="50%" font-size="80" text-anchor="middle" dominant-baseline="middle">
					${emoji}
				</text>
			</svg>
		`.trim();
	}

	/**
	 * Validate icon data
	 */
	validate(iconData: IconData): boolean {
		if (!iconData.format || !iconData.data) {
			return false;
		}

		if (iconData.format === 'svg') {
			if (typeof iconData.data !== 'string') {
				return false;
			}

			// Basic SVG validation
			return iconData.data.includes('<svg');
		}

		return true;
	}
}

/**
 * Create icon configuration
 */
export function createIconConfig(type: IconConfig['type'], value: string): IconConfig {
	return {
		type,
		value,
		optimized: false,
	};
}

/**
 * Icon presets
 */
export const iconPresets = {
	/**
	 * FontAwesome icon
	 */
	fontAwesome(icon: string): IconConfig {
		return createIconConfig('fontawesome', `fa:${icon}`);
	},

	/**
	 * Emoji icon
	 */
	emoji(emoji: string): IconConfig {
		return createIconConfig('emoji', emoji);
	},

	/**
	 * File icon
	 */
	file(filename: string): IconConfig {
		return createIconConfig('file', filename);
	},

	/**
	 * URL icon
	 */
	url(url: string): IconConfig {
		return createIconConfig('url', url);
	},

	/**
	 * Common icons
	 */
	common: {
		api: createIconConfig('fontawesome', 'fa:plug'),
		database: createIconConfig('fontawesome', 'fa:database'),
		webhook: createIconConfig('fontawesome', 'fa:webhook'),
		cloud: createIconConfig('fontawesome', 'fa:cloud'),
		gear: createIconConfig('fontawesome', 'fa:gear'),
		chart: createIconConfig('fontawesome', 'fa:chart-line'),
		email: createIconConfig('fontawesome', 'fa:envelope'),
		calendar: createIconConfig('fontawesome', 'fa:calendar'),
		user: createIconConfig('fontawesome', 'fa:user'),
		file: createIconConfig('fontawesome', 'fa:file'),
		folder: createIconConfig('fontawesome', 'fa:folder'),
		globe: createIconConfig('fontawesome', 'fa:globe'),
		lock: createIconConfig('fontawesome', 'fa:lock'),
		key: createIconConfig('fontawesome', 'fa:key'),
	},
};

/**
 * Export icon manager instance
 */
export const iconManager = new IconManager();
