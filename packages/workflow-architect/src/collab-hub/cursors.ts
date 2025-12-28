import { EventEmitter } from 'events';
import type { Cursor, Position, Selection } from './types';
import { CursorSchema } from './types';

interface CursorTrackerOptions {
	interpolationMs?: number;
	maxCursors?: number;
	cleanupInterval?: number;
	staleTimeout?: number;
}

interface InterpolatedCursor extends Cursor {
	targetPosition: Position;
	velocity: { x: number; y: number };
}

/**
 * Multi-user cursor tracker with color assignment and smooth interpolation
 */
export class CursorTracker extends EventEmitter {
	private cursors: Map<string, InterpolatedCursor>;
	private colorAssignments: Map<string, string>;
	private availableColors: string[];
	private usedColors: Set<string>;
	private interpolationFrame: number | null;
	private cleanupInterval: NodeJS.Timeout | null;
	private options: Required<CursorTrackerOptions>;

	// Predefined color palette for user cursors
	private static readonly COLOR_PALETTE = [
		'#FF6B6B', // Red
		'#4ECDC4', // Teal
		'#45B7D1', // Blue
		'#FFA07A', // Light salmon
		'#98D8C8', // Mint
		'#F7DC6F', // Yellow
		'#BB8FCE', // Purple
		'#85C1E2', // Sky blue
		'#F8B88B', // Peach
		'#A9DFBF', // Light green
		'#F1948A', // Pink
		'#85929E', // Gray
	];

	constructor(options: CursorTrackerOptions = {}) {
		super();
		this.cursors = new Map();
		this.colorAssignments = new Map();
		this.availableColors = [...CursorTracker.COLOR_PALETTE];
		this.usedColors = new Set();
		this.interpolationFrame = null;
		this.cleanupInterval = null;
		this.options = {
			interpolationMs: options.interpolationMs ?? 16, // ~60 FPS
			maxCursors: options.maxCursors ?? 50,
			cleanupInterval: options.cleanupInterval ?? 60000, // 1 minute
			staleTimeout: options.staleTimeout ?? 10000, // 10 seconds
		};

		this.startInterpolation();
		this.startCleanup();
	}

	/**
	 * Track a user's cursor position
	 */
	track(userId: string, position: Position, selection?: Selection): void {
		if (this.cursors.size >= this.options.maxCursors && !this.cursors.has(userId)) {
			throw new Error('Maximum cursor limit reached');
		}

		const color = this.assignColor(userId);
		const existingCursor = this.cursors.get(userId);

		const cursor: InterpolatedCursor = CursorSchema.parse({
			userId,
			position: existingCursor?.position ?? position,
			selection,
			color,
			timestamp: new Date(),
		}) as InterpolatedCursor;

		// Set target position for interpolation
		cursor.targetPosition = position;

		// Calculate velocity if cursor exists
		if (existingCursor) {
			const dt = cursor.timestamp.getTime() - existingCursor.timestamp.getTime();
			if (dt > 0) {
				cursor.velocity = {
					x: (position.x - existingCursor.position.x) / dt,
					y: (position.y - existingCursor.position.y) / dt,
				};
			} else {
				cursor.velocity = { x: 0, y: 0 };
			}
		} else {
			cursor.velocity = { x: 0, y: 0 };
		}

		this.cursors.set(userId, cursor);
		this.emit('cursor_updated', { userId, position, selection });
	}

	/**
	 * Remove a user's cursor
	 */
	removeCursor(userId: string): void {
		const cursor = this.cursors.get(userId);
		if (!cursor) {
			return;
		}

		this.cursors.delete(userId);
		this.releaseColor(userId);
		this.emit('cursor_removed', { userId });
	}

	/**
	 * Get all active cursors
	 */
	getCursors(): Cursor[] {
		return Array.from(this.cursors.values()).map(cursor => ({
			userId: cursor.userId,
			position: cursor.position,
			selection: cursor.selection,
			color: cursor.color,
			timestamp: cursor.timestamp,
		}));
	}

	/**
	 * Get a specific user's cursor
	 */
	getCursor(userId: string): Cursor | undefined {
		const cursor = this.cursors.get(userId);
		if (!cursor) {
			return undefined;
		}

		return {
			userId: cursor.userId,
			position: cursor.position,
			selection: cursor.selection,
			color: cursor.color,
			timestamp: cursor.timestamp,
		};
	}

	/**
	 * Get cursor color for a user
	 */
	getUserColor(userId: string): string | undefined {
		return this.colorAssignments.get(userId);
	}

	/**
	 * Assign a color to a user
	 */
	private assignColor(userId: string): string {
		// Return existing color if already assigned
		const existingColor = this.colorAssignments.get(userId);
		if (existingColor) {
			return existingColor;
		}

		// Get next available color
		let color: string;
		if (this.availableColors.length > 0) {
			// Use from available pool
			color = this.availableColors.shift()!;
		} else {
			// All colors used, generate a random one
			color = this.generateRandomColor();
		}

		this.colorAssignments.set(userId, color);
		this.usedColors.add(color);

		return color;
	}

	/**
	 * Release a user's color back to the pool
	 */
	private releaseColor(userId: string): void {
		const color = this.colorAssignments.get(userId);
		if (!color) {
			return;
		}

		this.colorAssignments.delete(userId);
		this.usedColors.delete(color);

		// Only add back to pool if it's from the original palette
		if (CursorTracker.COLOR_PALETTE.includes(color)) {
			this.availableColors.push(color);
		}
	}

	/**
	 * Generate a random color
	 */
	private generateRandomColor(): string {
		const hue = Math.floor(Math.random() * 360);
		const saturation = 65 + Math.floor(Math.random() * 20); // 65-85%
		const lightness = 55 + Math.floor(Math.random() * 15); // 55-70%

		return this.hslToHex(hue, saturation, lightness);
	}

	/**
	 * Convert HSL to hex color
	 */
	private hslToHex(h: number, s: number, l: number): string {
		const sNorm = s / 100;
		const lNorm = l / 100;

		const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
		const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
		const m = lNorm - c / 2;

		let r = 0;
		let g = 0;
		let b = 0;

		if (h >= 0 && h < 60) {
			r = c; g = x; b = 0;
		} else if (h >= 60 && h < 120) {
			r = x; g = c; b = 0;
		} else if (h >= 120 && h < 180) {
			r = 0; g = c; b = x;
		} else if (h >= 180 && h < 240) {
			r = 0; g = x; b = c;
		} else if (h >= 240 && h < 300) {
			r = x; g = 0; b = c;
		} else if (h >= 300 && h < 360) {
			r = c; g = 0; b = x;
		}

		const toHex = (n: number) => {
			const hex = Math.round((n + m) * 255).toString(16);
			return hex.length === 1 ? '0' + hex : hex;
		};

		return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
	}

	/**
	 * Start cursor interpolation loop
	 */
	private startInterpolation(): void {
		const interpolate = () => {
			const now = Date.now();

			for (const [userId, cursor] of this.cursors) {
				// Linear interpolation towards target position
				const dx = cursor.targetPosition.x - cursor.position.x;
				const dy = cursor.targetPosition.y - cursor.position.y;
				const distance = Math.sqrt(dx * dx + dy * dy);

				if (distance > 1) {
					// Smooth interpolation (ease-out)
					const factor = 0.2; // Interpolation speed
					cursor.position = {
						x: cursor.position.x + dx * factor,
						y: cursor.position.y + dy * factor,
					};
				} else {
					// Snap to target when close enough
					cursor.position = { ...cursor.targetPosition };
				}
			}

			this.interpolationFrame = requestAnimationFrame(interpolate) as unknown as number;
		};

		this.interpolationFrame = requestAnimationFrame(interpolate) as unknown as number;
	}

	/**
	 * Stop cursor interpolation
	 */
	private stopInterpolation(): void {
		if (this.interpolationFrame !== null) {
			cancelAnimationFrame(this.interpolationFrame);
			this.interpolationFrame = null;
		}
	}

	/**
	 * Start cleanup interval to remove stale cursors
	 */
	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			this.cleanupStaleCursors();
		}, this.options.cleanupInterval);
	}

	/**
	 * Stop cleanup interval
	 */
	private stopCleanup(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	/**
	 * Remove cursors that haven't been updated recently
	 */
	private cleanupStaleCursors(): void {
		const now = Date.now();
		const staleUserIds: string[] = [];

		for (const [userId, cursor] of this.cursors) {
			const age = now - cursor.timestamp.getTime();
			if (age > this.options.staleTimeout) {
				staleUserIds.push(userId);
			}
		}

		for (const userId of staleUserIds) {
			this.removeCursor(userId);
			this.emit('cursor_stale', { userId });
		}
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.stopInterpolation();
		this.stopCleanup();
		this.cursors.clear();
		this.colorAssignments.clear();
		this.usedColors.clear();
		this.removeAllListeners();
	}
}

/**
 * Create a cursor tracker instance
 */
export function createCursorTracker(options?: CursorTrackerOptions): CursorTracker {
	return new CursorTracker(options);
}
