import { z } from 'zod';

/**
 * Data Generator for creating realistic mock data
 * Uses seeded random for deterministic data generation
 */

// Simple seeded random number generator (Mulberry32)
class SeededRandom {
	private seed: number;

	constructor(seed: number) {
		this.seed = seed;
	}

	next(): number {
		let t = (this.seed += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	nextInt(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}

	choice<T>(array: T[]): T {
		return array[this.nextInt(0, array.length - 1)];
	}

	shuffle<T>(array: T[]): T[] {
		const result = [...array];
		for (let i = result.length - 1; i > 0; i--) {
			const j = this.nextInt(0, i);
			[result[i], result[j]] = [result[j], result[i]];
		}
		return result;
	}
}

export interface DataSchema {
	type:
		| 'string'
		| 'number'
		| 'boolean'
		| 'date'
		| 'email'
		| 'url'
		| 'uuid'
		| 'name'
		| 'address'
		| 'phone'
		| 'company'
		| 'product'
		| 'array'
		| 'object'
		| 'custom';
	min?: number;
	max?: number;
	length?: number;
	format?: string;
	pattern?: string;
	enum?: unknown[];
	items?: DataSchema;
	properties?: Record<string, DataSchema>;
	generator?: () => unknown;
}

export class DataGenerator {
	private random: SeededRandom;
	private customGenerators: Map<string, () => unknown> = new Map();

	// Sample data pools
	private firstNames = [
		'John',
		'Jane',
		'Michael',
		'Sarah',
		'David',
		'Emily',
		'James',
		'Emma',
		'Robert',
		'Olivia',
	];
	private lastNames = [
		'Smith',
		'Johnson',
		'Williams',
		'Brown',
		'Jones',
		'Garcia',
		'Miller',
		'Davis',
		'Rodriguez',
		'Martinez',
	];
	private domains = ['example.com', 'test.com', 'demo.com', 'sample.org', 'mock.net'];
	private companies = [
		'Acme Corp',
		'TechStart Inc',
		'Global Solutions',
		'Innovation Labs',
		'Digital Ventures',
	];
	private products = [
		'Widget',
		'Gadget',
		'Device',
		'Tool',
		'Instrument',
		'Apparatus',
		'Machine',
	];
	private streets = ['Main St', 'Oak Ave', 'Maple Dr', 'Pine Rd', 'Cedar Ln'];
	private cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
	private states = ['NY', 'CA', 'IL', 'TX', 'AZ'];

	constructor(seed?: number) {
		this.random = new SeededRandom(seed ?? Date.now());
	}

	/**
	 * Generate data based on schema
	 */
	generate(schema: DataSchema): unknown {
		if (schema.enum) {
			return this.random.choice(schema.enum);
		}

		if (schema.generator) {
			return schema.generator();
		}

		switch (schema.type) {
			case 'string':
				return this.generateString(schema);
			case 'number':
				return this.generateNumber(schema);
			case 'boolean':
				return this.random.next() > 0.5;
			case 'date':
				return this.generateDate(schema);
			case 'email':
				return this.generateEmail();
			case 'url':
				return this.generateUrl();
			case 'uuid':
				return this.generateUuid();
			case 'name':
				return this.generateName();
			case 'address':
				return this.generateAddress();
			case 'phone':
				return this.generatePhone();
			case 'company':
				return this.random.choice(this.companies);
			case 'product':
				return this.random.choice(this.products);
			case 'array':
				return this.generateArray(schema);
			case 'object':
				return this.generateObject(schema);
			case 'custom':
				if (schema.generator) {
					return schema.generator();
				}
				throw new Error('Custom schema requires generator function');
			default:
				return null;
		}
	}

	/**
	 * Generate from Zod schema
	 */
	generateFromZod(schema: z.ZodTypeAny): unknown {
		const def = schema._def;

		if (def.typeName === 'ZodString') {
			return this.generateString({ type: 'string', length: 10 });
		}
		if (def.typeName === 'ZodNumber') {
			return this.generateNumber({ type: 'number', min: 0, max: 100 });
		}
		if (def.typeName === 'ZodBoolean') {
			return this.random.next() > 0.5;
		}
		if (def.typeName === 'ZodDate') {
			return this.generateDate({ type: 'date' });
		}
		if (def.typeName === 'ZodArray') {
			const length = this.random.nextInt(1, 5);
			return Array.from({ length }, () => this.generateFromZod(def.type));
		}
		if (def.typeName === 'ZodObject') {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(def.shape() as Record<string, z.ZodTypeAny>)) {
				result[key] = this.generateFromZod(value);
			}
			return result;
		}
		if (def.typeName === 'ZodEnum') {
			return this.random.choice(def.values as unknown[]);
		}
		if (def.typeName === 'ZodOptional') {
			return this.random.next() > 0.3 ? this.generateFromZod(def.innerType) : undefined;
		}
		if (def.typeName === 'ZodNullable') {
			return this.random.next() > 0.1 ? this.generateFromZod(def.innerType) : null;
		}

		return null;
	}

	private generateString(schema: DataSchema): string {
		const length = schema.length ?? this.random.nextInt(5, 20);
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars[this.random.nextInt(0, chars.length - 1)];
		}
		return result;
	}

	private generateNumber(schema: DataSchema): number {
		const min = schema.min ?? 0;
		const max = schema.max ?? 1000;
		return this.random.nextInt(min, max);
	}

	private generateDate(schema: DataSchema): Date {
		const now = Date.now();
		const min = schema.min ?? now - 365 * 24 * 60 * 60 * 1000; // 1 year ago
		const max = schema.max ?? now;
		const timestamp = this.random.nextInt(min, max);
		return new Date(timestamp);
	}

	private generateEmail(): string {
		const firstName = this.random.choice(this.firstNames).toLowerCase();
		const lastName = this.random.choice(this.lastNames).toLowerCase();
		const domain = this.random.choice(this.domains);
		return `${firstName}.${lastName}@${domain}`;
	}

	private generateUrl(): string {
		const protocol = this.random.choice(['http', 'https']);
		const domain = this.random.choice(this.domains);
		const path = this.generateString({ type: 'string', length: 8 }).toLowerCase();
		return `${protocol}://${domain}/${path}`;
	}

	private generateUuid(): string {
		const hex = '0123456789abcdef';
		let uuid = '';
		for (let i = 0; i < 36; i++) {
			if (i === 8 || i === 13 || i === 18 || i === 23) {
				uuid += '-';
			} else if (i === 14) {
				uuid += '4';
			} else if (i === 19) {
				uuid += hex[this.random.nextInt(8, 11)];
			} else {
				uuid += hex[this.random.nextInt(0, 15)];
			}
		}
		return uuid;
	}

	private generateName(): string {
		const firstName = this.random.choice(this.firstNames);
		const lastName = this.random.choice(this.lastNames);
		return `${firstName} ${lastName}`;
	}

	private generateAddress(): string {
		const number = this.random.nextInt(1, 9999);
		const street = this.random.choice(this.streets);
		const city = this.random.choice(this.cities);
		const state = this.random.choice(this.states);
		const zip = this.random.nextInt(10000, 99999);
		return `${number} ${street}, ${city}, ${state} ${zip}`;
	}

	private generatePhone(): string {
		const area = this.random.nextInt(200, 999);
		const prefix = this.random.nextInt(200, 999);
		const line = this.random.nextInt(1000, 9999);
		return `(${area}) ${prefix}-${line}`;
	}

	private generateArray(schema: DataSchema): unknown[] {
		const length = schema.length ?? this.random.nextInt(1, 10);
		const items = schema.items ?? { type: 'string' };
		return Array.from({ length }, () => this.generate(items));
	}

	private generateObject(schema: DataSchema): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		const properties = schema.properties ?? {};

		for (const [key, propSchema] of Object.entries(properties)) {
			result[key] = this.generate(propSchema);
		}

		return result;
	}

	/**
	 * Register a custom generator
	 */
	registerGenerator(name: string, generator: () => unknown): void {
		this.customGenerators.set(name, generator);
	}

	/**
	 * Generate batch of data
	 */
	generateBatch(schema: DataSchema, count: number): unknown[] {
		return Array.from({ length: count }, () => this.generate(schema));
	}

	/**
	 * Generate realistic workflow execution data
	 */
	generateWorkflowData(nodeId: string, dataType: 'input' | 'output'): Record<string, unknown> {
		return {
			[dataType]: {
				id: this.generateUuid(),
				timestamp: this.generateDate({ type: 'date' }).toISOString(),
				nodeId,
				data: this.generateObject({
					type: 'object',
					properties: {
						name: { type: 'name' },
						email: { type: 'email' },
						value: { type: 'number', min: 1, max: 1000 },
						status: { type: 'string', enum: ['active', 'pending', 'completed'] },
					},
				}),
			},
		};
	}

	/**
	 * Generate time series data
	 */
	generateTimeSeries(
		count: number,
		startTime: number,
		interval: number,
	): Array<{ timestamp: number; value: number }> {
		const result: Array<{ timestamp: number; value: number }> = [];
		let time = startTime;

		for (let i = 0; i < count; i++) {
			result.push({
				timestamp: time,
				value: this.generateNumber({ type: 'number', min: 0, max: 100 }),
			});
			time += interval;
		}

		return result;
	}

	/**
	 * Generate error data
	 */
	generateError(): { message: string; type: string; stack?: string } {
		const errorTypes = ['NetworkError', 'TimeoutError', 'ValidationError', 'AuthError'];
		const messages = [
			'Connection refused',
			'Request timeout',
			'Invalid input',
			'Authentication failed',
		];

		return {
			message: this.random.choice(messages),
			type: this.random.choice(errorTypes),
			stack: this.random.next() > 0.5 ? 'Error stack trace...' : undefined,
		};
	}

	/**
	 * Reset random seed
	 */
	setSeed(seed: number): void {
		this.random = new SeededRandom(seed);
	}
}

/**
 * Pre-built schemas for common data types
 */
export const CommonSchemas = {
	user: {
		type: 'object' as const,
		properties: {
			id: { type: 'uuid' as const },
			name: { type: 'name' as const },
			email: { type: 'email' as const },
			phone: { type: 'phone' as const },
			createdAt: { type: 'date' as const },
		},
	},
	order: {
		type: 'object' as const,
		properties: {
			id: { type: 'uuid' as const },
			product: { type: 'product' as const },
			quantity: { type: 'number' as const, min: 1, max: 100 },
			price: { type: 'number' as const, min: 1, max: 10000 },
			status: {
				type: 'string' as const,
				enum: ['pending', 'processing', 'shipped', 'delivered'],
			},
			createdAt: { type: 'date' as const },
		},
	},
	company: {
		type: 'object' as const,
		properties: {
			id: { type: 'uuid' as const },
			name: { type: 'company' as const },
			address: { type: 'address' as const },
			phone: { type: 'phone' as const },
			website: { type: 'url' as const },
		},
	},
};
