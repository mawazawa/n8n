import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type BrandingConfig, BrandingConfigSchema } from './types';

/**
 * CSS variable mapping
 */
interface CSSVariables {
	'--primary-color': string;
	'--secondary-color': string;
	'--accent-color': string;
	[key: string]: string;
}

/**
 * BrandingManager handles white-label theming
 */
export class BrandingManager {
	private supabase: SupabaseClient;
	private cache: Map<string, { config: BrandingConfig; timestamp: number }>;
	private readonly cacheTTL = 300000; // 5 minutes

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.cache = new Map();
	}

	/**
	 * Set branding configuration for a tenant
	 */
	async setBranding(tenantId: string, config: BrandingConfig): Promise<void> {
		// Validate branding config
		const validatedConfig = BrandingConfigSchema.parse(config);

		// Update tenant branding
		const { error } = await this.supabase
			.from('tenants')
			.update({
				branding: validatedConfig,
				updated_at: new Date().toISOString(),
			})
			.eq('id', tenantId);

		if (error) {
			throw new Error(`Failed to set branding: ${error.message}`);
		}

		// Also store in separate branding table for faster access
		await this.supabase.from('tenant_branding').upsert({
			tenant_id: tenantId,
			primary_color: validatedConfig.primaryColor,
			secondary_color: validatedConfig.secondaryColor,
			accent_color: validatedConfig.accentColor,
			logo_url: validatedConfig.logoUrl,
			favicon_url: validatedConfig.faviconUrl,
			custom_domain: validatedConfig.customDomain,
			company_name: validatedConfig.companyName,
			custom_css: validatedConfig.customCss,
			email_templates: validatedConfig.emailTemplates,
			updated_at: new Date().toISOString(),
		});

		// Clear cache
		this.cache.delete(tenantId);
	}

	/**
	 * Get branding configuration for a tenant
	 */
	async getBranding(tenantId: string): Promise<BrandingConfig | null> {
		// Check cache first
		const cached = this.cache.get(tenantId);
		if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
			return cached.config;
		}

		// Fetch from database
		const { data, error } = await this.supabase
			.from('tenant_branding')
			.select('*')
			.eq('tenant_id', tenantId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get branding: ${error.message}`);
		}

		if (!data) {
			return null;
		}

		const config: BrandingConfig = {
			primaryColor: data.primary_color,
			secondaryColor: data.secondary_color,
			accentColor: data.accent_color,
			logoUrl: data.logo_url,
			faviconUrl: data.favicon_url,
			customDomain: data.custom_domain,
			companyName: data.company_name,
			customCss: data.custom_css,
			emailTemplates: data.email_templates,
		};

		// Cache result
		this.cache.set(tenantId, {
			config,
			timestamp: Date.now(),
		});

		return config;
	}

	/**
	 * Generate CSS variables from branding config
	 */
	generateCSSVariables(config: BrandingConfig): CSSVariables {
		const variables: CSSVariables = {
			'--primary-color': config.primaryColor,
			'--secondary-color': config.secondaryColor,
			'--accent-color': config.accentColor,
		};

		// Generate lighter/darker variants
		variables['--primary-color-light'] = this.lightenColor(config.primaryColor, 20);
		variables['--primary-color-dark'] = this.darkenColor(config.primaryColor, 20);
		variables['--secondary-color-light'] = this.lightenColor(config.secondaryColor, 20);
		variables['--secondary-color-dark'] = this.darkenColor(config.secondaryColor, 20);
		variables['--accent-color-light'] = this.lightenColor(config.accentColor, 20);
		variables['--accent-color-dark'] = this.darkenColor(config.accentColor, 20);

		return variables;
	}

	/**
	 * Generate CSS stylesheet
	 */
	generateStylesheet(config: BrandingConfig): string {
		const variables = this.generateCSSVariables(config);

		let css = ':root {\n';
		for (const [key, value] of Object.entries(variables)) {
			css += `  ${key}: ${value};\n`;
		}
		css += '}\n\n';

		// Add custom CSS if provided
		if (config.customCss) {
			css += `/* Custom CSS */\n${config.customCss}\n`;
		}

		return css;
	}

	/**
	 * Generate HTML meta tags for branding
	 */
	generateMetaTags(config: BrandingConfig): string {
		const tags: string[] = [];

		if (config.faviconUrl) {
			tags.push(`<link rel="icon" type="image/png" href="${config.faviconUrl}" />`);
		}

		tags.push(`<meta name="application-name" content="${config.companyName}" />`);
		tags.push(`<meta name="theme-color" content="${config.primaryColor}" />`);

		return tags.join('\n');
	}

	/**
	 * Apply branding to HTML response
	 */
	applyBrandingToHTML(html: string, config: BrandingConfig): string {
		let modifiedHTML = html;

		// Inject CSS variables
		const stylesheet = this.generateStylesheet(config);
		const styleTag = `<style id="tenant-branding">\n${stylesheet}\n</style>`;

		// Insert before closing head tag
		modifiedHTML = modifiedHTML.replace('</head>', `${styleTag}\n</head>`);

		// Inject meta tags
		const metaTags = this.generateMetaTags(config);
		modifiedHTML = modifiedHTML.replace('</head>', `${metaTags}\n</head>`);

		// Replace title
		modifiedHTML = modifiedHTML.replace(
			/<title>.*?<\/title>/,
			`<title>${config.companyName}</title>`,
		);

		return modifiedHTML;
	}

	/**
	 * Get email template
	 */
	async getEmailTemplate(
		tenantId: string,
		templateName: string,
	): Promise<{ subject: string; html: string; text: string } | null> {
		const branding = await this.getBranding(tenantId);

		if (!branding?.emailTemplates?.[templateName]) {
			return null;
		}

		return branding.emailTemplates[templateName];
	}

	/**
	 * Apply branding to email template
	 */
	applyBrandingToEmail(
		template: { subject: string; html: string; text: string },
		config: BrandingConfig,
	): { subject: string; html: string; text: string } {
		// Replace placeholders
		const replacements: Record<string, string> = {
			'{{company_name}}': config.companyName,
			'{{primary_color}}': config.primaryColor,
			'{{logo_url}}': config.logoUrl ?? '',
		};

		let subject = template.subject;
		let html = template.html;
		let text = template.text;

		for (const [placeholder, value] of Object.entries(replacements)) {
			subject = subject.replace(new RegExp(placeholder, 'g'), value);
			html = html.replace(new RegExp(placeholder, 'g'), value);
			text = text.replace(new RegExp(placeholder, 'g'), value);
		}

		return { subject, html, text };
	}

	/**
	 * Upload logo/favicon asset
	 */
	async uploadAsset(
		tenantId: string,
		file: { name: string; data: Buffer; mimeType: string },
		type: 'logo' | 'favicon',
	): Promise<string> {
		const path = `tenants/${tenantId}/${type}/${file.name}`;

		const { data, error } = await this.supabase.storage
			.from('branding-assets')
			.upload(path, file.data, {
				contentType: file.mimeType,
				upsert: true,
			});

		if (error) {
			throw new Error(`Failed to upload asset: ${error.message}`);
		}

		// Get public URL
		const {
			data: { publicUrl },
		} = this.supabase.storage.from('branding-assets').getPublicUrl(path);

		return publicUrl;
	}

	/**
	 * Delete branding assets
	 */
	async deleteAssets(tenantId: string): Promise<void> {
		const { error } = await this.supabase.storage
			.from('branding-assets')
			.remove([`tenants/${tenantId}/logo`, `tenants/${tenantId}/favicon`]);

		if (error) {
			throw new Error(`Failed to delete assets: ${error.message}`);
		}
	}

	/**
	 * Lighten a hex color
	 */
	private lightenColor(hex: string, percent: number): string {
		const rgb = this.hexToRgb(hex);
		const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
		hsl.l = Math.min(100, hsl.l + percent);
		const newRgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);
		return this.rgbToHex(newRgb.r, newRgb.g, newRgb.b);
	}

	/**
	 * Darken a hex color
	 */
	private darkenColor(hex: string, percent: number): string {
		const rgb = this.hexToRgb(hex);
		const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
		hsl.l = Math.max(0, hsl.l - percent);
		const newRgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);
		return this.rgbToHex(newRgb.r, newRgb.g, newRgb.b);
	}

	/**
	 * Convert hex to RGB
	 */
	private hexToRgb(hex: string): { r: number; g: number; b: number } {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16),
				}
			: { r: 0, g: 0, b: 0 };
	}

	/**
	 * Convert RGB to hex
	 */
	private rgbToHex(r: number, g: number, b: number): string {
		return `#${((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1)}`;
	}

	/**
	 * Convert RGB to HSL
	 */
	private rgbToHsl(
		r: number,
		g: number,
		b: number,
	): { h: number; s: number; l: number } {
		r /= 255;
		g /= 255;
		b /= 255;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h = 0;
		let s = 0;
		const l = (max + min) / 2;

		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

			switch (max) {
				case r:
					h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
					break;
				case g:
					h = ((b - r) / d + 2) / 6;
					break;
				case b:
					h = ((r - g) / d + 4) / 6;
					break;
			}
		}

		return { h: h * 360, s: s * 100, l: l * 100 };
	}

	/**
	 * Convert HSL to RGB
	 */
	private hslToRgb(
		h: number,
		s: number,
		l: number,
	): { r: number; g: number; b: number } {
		h /= 360;
		s /= 100;
		l /= 100;

		let r: number;
		let g: number;
		let b: number;

		if (s === 0) {
			r = g = b = l;
		} else {
			const hue2rgb = (p: number, q: number, t: number): number => {
				if (t < 0) t += 1;
				if (t > 1) t -= 1;
				if (t < 1 / 6) return p + (q - p) * 6 * t;
				if (t < 1 / 2) return q;
				if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
				return p;
			};

			const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;

			r = hue2rgb(p, q, h + 1 / 3);
			g = hue2rgb(p, q, h);
			b = hue2rgb(p, q, h - 1 / 3);
		}

		return { r: r * 255, g: g * 255, b: b * 255 };
	}

	/**
	 * Clear cache
	 */
	clearCache(tenantId?: string): void {
		if (tenantId) {
			this.cache.delete(tenantId);
		} else {
			this.cache.clear();
		}
	}
}
