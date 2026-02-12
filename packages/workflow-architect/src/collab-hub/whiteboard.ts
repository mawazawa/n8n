import { EventEmitter } from 'events';
import type { WhiteboardElement, Position } from './types';
import { WhiteboardElementSchema } from './types';

interface WhiteboardOptions {
	width?: number;
	height?: number;
	backgroundColor?: string;
	maxElements?: number;
	maxUndoSteps?: number;
}

interface DrawingTool {
	type: 'pen' | 'rectangle' | 'circle' | 'line' | 'text' | 'arrow';
	color: string;
	strokeWidth: number;
}

/**
 * Collaborative whiteboard with drawing tools and multi-user support
 */
export class Whiteboard extends EventEmitter {
	private elements: Map<string, WhiteboardElement>;
	private undoStack: WhiteboardElement[][];
	private redoStack: WhiteboardElement[][];
	private currentTool: DrawingTool;
	private options: Required<WhiteboardOptions>;
	private isDrawing: boolean;
	private currentElement: WhiteboardElement | null;

	constructor(options: WhiteboardOptions = {}) {
		super();
		this.elements = new Map();
		this.undoStack = [];
		this.redoStack = [];
		this.isDrawing = false;
		this.currentElement = null;
		this.currentTool = {
			type: 'pen',
			color: '#000000',
			strokeWidth: 2,
		};
		this.options = {
			width: options.width ?? 1920,
			height: options.height ?? 1080,
			backgroundColor: options.backgroundColor ?? '#FFFFFF',
			maxElements: options.maxElements ?? 10000,
			maxUndoSteps: options.maxUndoSteps ?? 50,
		};
	}

	/**
	 * Set drawing tool
	 */
	setTool(tool: Partial<DrawingTool>): void {
		this.currentTool = { ...this.currentTool, ...tool };
		this.emit('tool_changed', { tool: this.currentTool });
	}

	/**
	 * Get current tool
	 */
	getCurrentTool(): DrawingTool {
		return { ...this.currentTool };
	}

	/**
	 * Start drawing
	 */
	startDrawing(userId: string, position: Position): void {
		if (this.elements.size >= this.options.maxElements) {
			throw new Error('Maximum elements limit reached');
		}

		this.isDrawing = true;
		this.currentElement = WhiteboardElementSchema.parse({
			id: this.generateId(),
			type: this.currentTool.type,
			userId,
			color: this.currentTool.color,
			strokeWidth: this.currentTool.strokeWidth,
			points: [position],
			position,
			timestamp: new Date(),
		});
	}

	/**
	 * Continue drawing
	 */
	continueDrawing(position: Position): void {
		if (!this.isDrawing || !this.currentElement) {
			return;
		}

		if (this.currentElement.type === 'pen') {
			if (!this.currentElement.points) {
				this.currentElement.points = [];
			}
			this.currentElement.points.push(position);
		} else {
			// For shapes, update end position
			this.currentElement.width = position.x - (this.currentElement.position?.x ?? 0);
			this.currentElement.height = position.y - (this.currentElement.position?.y ?? 0);
		}

		this.emit('drawing_updated', { element: this.currentElement });
	}

	/**
	 * End drawing
	 */
	endDrawing(): void {
		if (!this.isDrawing || !this.currentElement) {
			return;
		}

		this.isDrawing = false;
		this.addElement(this.currentElement);
		this.currentElement = null;
	}

	/**
	 * Add element to whiteboard
	 */
	addElement(element: WhiteboardElement): void {
		this.elements.set(element.id, element);
		this.saveToUndoStack();
		this.redoStack = []; // Clear redo stack on new action
		this.emit('element_added', { element });
	}

	/**
	 * Update element
	 */
	updateElement(elementId: string, updates: Partial<WhiteboardElement>): void {
		const element = this.elements.get(elementId);
		if (!element) {
			throw new Error('Element not found');
		}

		const updated = { ...element, ...updates };
		this.elements.set(elementId, updated);
		this.saveToUndoStack();
		this.redoStack = [];
		this.emit('element_updated', { element: updated });
	}

	/**
	 * Remove element
	 */
	removeElement(elementId: string): void {
		const element = this.elements.get(elementId);
		if (!element) {
			return;
		}

		this.elements.delete(elementId);
		this.saveToUndoStack();
		this.redoStack = [];
		this.emit('element_removed', { elementId });
	}

	/**
	 * Add text element
	 */
	addText(userId: string, position: Position, text: string): void {
		const element = WhiteboardElementSchema.parse({
			id: this.generateId(),
			type: 'text',
			userId,
			color: this.currentTool.color,
			strokeWidth: this.currentTool.strokeWidth,
			position,
			text,
			timestamp: new Date(),
		});

		this.addElement(element);
	}

	/**
	 * Clear whiteboard
	 */
	clear(): void {
		this.saveToUndoStack();
		this.elements.clear();
		this.redoStack = [];
		this.emit('cleared');
	}

	/**
	 * Undo last action
	 */
	undo(): void {
		if (this.undoStack.length === 0) {
			return;
		}

		const currentState = Array.from(this.elements.values());
		this.redoStack.push(currentState);

		const previousState = this.undoStack.pop()!;
		this.elements.clear();
		previousState.forEach(element => {
			this.elements.set(element.id, element);
		});

		this.emit('undo');
	}

	/**
	 * Redo last undone action
	 */
	redo(): void {
		if (this.redoStack.length === 0) {
			return;
		}

		const currentState = Array.from(this.elements.values());
		this.undoStack.push(currentState);

		const nextState = this.redoStack.pop()!;
		this.elements.clear();
		nextState.forEach(element => {
			this.elements.set(element.id, element);
		});

		this.emit('redo');
	}

	/**
	 * Save current state to undo stack
	 */
	private saveToUndoStack(): void {
		const currentState = Array.from(this.elements.values());
		this.undoStack.push(currentState);

		// Limit undo stack size
		if (this.undoStack.length > this.options.maxUndoSteps) {
			this.undoStack.shift();
		}
	}

	/**
	 * Export whiteboard to image
	 */
	async exportToImage(): Promise<Blob> {
		const canvas = document.createElement('canvas');
		canvas.width = this.options.width;
		canvas.height = this.options.height;
		const ctx = canvas.getContext('2d');

		if (!ctx) {
			throw new Error('Failed to get canvas context');
		}

		// Draw background
		ctx.fillStyle = this.options.backgroundColor;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Draw all elements
		for (const element of this.elements.values()) {
			this.drawElement(ctx, element);
		}

		return new Promise((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error('Failed to export image'));
				}
			}, 'image/png');
		});
	}

	/**
	 * Draw element on canvas context
	 */
	private drawElement(ctx: CanvasRenderingContext2D, element: WhiteboardElement): void {
		ctx.strokeStyle = element.color;
		ctx.lineWidth = element.strokeWidth;
		ctx.fillStyle = element.color;

		switch (element.type) {
			case 'pen':
				if (element.points && element.points.length > 1) {
					ctx.beginPath();
					ctx.moveTo(element.points[0].x, element.points[0].y);
					for (let i = 1; i < element.points.length; i++) {
						ctx.lineTo(element.points[i].x, element.points[i].y);
					}
					ctx.stroke();
				}
				break;

			case 'rectangle':
				if (element.position && element.width && element.height) {
					ctx.strokeRect(
						element.position.x,
						element.position.y,
						element.width,
						element.height
					);
				}
				break;

			case 'circle':
				if (element.position && element.width && element.height) {
					const radiusX = Math.abs(element.width) / 2;
					const radiusY = Math.abs(element.height) / 2;
					const centerX = element.position.x + element.width / 2;
					const centerY = element.position.y + element.height / 2;
					ctx.beginPath();
					ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
					ctx.stroke();
				}
				break;

			case 'line':
				if (element.points && element.points.length === 2) {
					ctx.beginPath();
					ctx.moveTo(element.points[0].x, element.points[0].y);
					ctx.lineTo(element.points[1].x, element.points[1].y);
					ctx.stroke();
				}
				break;

			case 'text':
				if (element.position && element.text) {
					ctx.font = `${element.strokeWidth * 8}px Arial`;
					ctx.fillText(element.text, element.position.x, element.position.y);
				}
				break;

			case 'arrow':
				if (element.points && element.points.length === 2) {
					const start = element.points[0];
					const end = element.points[1];
					this.drawArrow(ctx, start.x, start.y, end.x, end.y, element.strokeWidth);
				}
				break;
		}
	}

	/**
	 * Draw arrow on canvas
	 */
	private drawArrow(
		ctx: CanvasRenderingContext2D,
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
		width: number
	): void {
		const headLength = 10 + width * 2;
		const angle = Math.atan2(toY - fromY, toX - fromX);

		// Draw line
		ctx.beginPath();
		ctx.moveTo(fromX, fromY);
		ctx.lineTo(toX, toY);
		ctx.stroke();

		// Draw arrowhead
		ctx.beginPath();
		ctx.moveTo(toX, toY);
		ctx.lineTo(
			toX - headLength * Math.cos(angle - Math.PI / 6),
			toY - headLength * Math.sin(angle - Math.PI / 6)
		);
		ctx.moveTo(toX, toY);
		ctx.lineTo(
			toX - headLength * Math.cos(angle + Math.PI / 6),
			toY - headLength * Math.sin(angle + Math.PI / 6)
		);
		ctx.stroke();
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get all elements
	 */
	getElements(): WhiteboardElement[] {
		return Array.from(this.elements.values());
	}

	/**
	 * Get element by ID
	 */
	getElement(elementId: string): WhiteboardElement | undefined {
		return this.elements.get(elementId);
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.elements.clear();
		this.undoStack = [];
		this.redoStack = [];
		this.removeAllListeners();
	}
}

/**
 * Create a whiteboard instance
 */
export function createWhiteboard(options?: WhiteboardOptions): Whiteboard {
	return new Whiteboard(options);
}
