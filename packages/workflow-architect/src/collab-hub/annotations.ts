import { EventEmitter } from 'events';
import type { Annotation, AnnotationReply, Position } from './types';
import { AnnotationSchema, AnnotationReplySchema } from './types';

interface AnnotationManagerOptions {
	maxAnnotations?: number;
	autoResolveTimeout?: number;
}

/**
 * Real-time annotation manager with threading support
 */
export class AnnotationManager extends EventEmitter {
	private annotations: Map<string, Annotation>;
	private options: Required<AnnotationManagerOptions>;

	constructor(options: AnnotationManagerOptions = {}) {
		super();
		this.annotations = new Map();
		this.options = {
			maxAnnotations: options.maxAnnotations ?? 1000,
			autoResolveTimeout: options.autoResolveTimeout ?? 0, // 0 = disabled
		};
	}

	/**
	 * Add a new annotation
	 */
	async add(annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt' | 'resolved' | 'replies'>): Promise<Annotation> {
		if (this.annotations.size >= this.options.maxAnnotations) {
			throw new Error('Maximum annotations limit reached');
		}

		const fullAnnotation: Annotation = AnnotationSchema.parse({
			...annotation,
			id: this.generateId(),
			createdAt: new Date(),
			updatedAt: new Date(),
			resolved: false,
			replies: [],
		});

		this.annotations.set(fullAnnotation.id, fullAnnotation);
		this.emit('annotation_added', { annotation: fullAnnotation });

		return fullAnnotation;
	}

	/**
	 * Update an annotation
	 */
	async update(annotationId: string, updates: Partial<Pick<Annotation, 'content' | 'position'>>): Promise<Annotation> {
		const annotation = this.annotations.get(annotationId);
		if (!annotation) {
			throw new Error('Annotation not found');
		}

		const updated: Annotation = {
			...annotation,
			...updates,
			updatedAt: new Date(),
		};

		this.annotations.set(annotationId, updated);
		this.emit('annotation_updated', { annotation: updated });

		return updated;
	}

	/**
	 * Delete an annotation
	 */
	async delete(annotationId: string): Promise<void> {
		const annotation = this.annotations.get(annotationId);
		if (!annotation) {
			throw new Error('Annotation not found');
		}

		this.annotations.delete(annotationId);
		this.emit('annotation_deleted', { annotationId });
	}

	/**
	 * Add a reply to an annotation
	 */
	async addReply(annotationId: string, reply: Omit<AnnotationReply, 'id' | 'createdAt'>): Promise<AnnotationReply> {
		const annotation = this.annotations.get(annotationId);
		if (!annotation) {
			throw new Error('Annotation not found');
		}

		const fullReply: AnnotationReply = AnnotationReplySchema.parse({
			...reply,
			id: this.generateId(),
			createdAt: new Date(),
		});

		annotation.replies.push(fullReply);
		annotation.updatedAt = new Date();

		this.annotations.set(annotationId, annotation);
		this.emit('reply_added', { annotationId, reply: fullReply });

		return fullReply;
	}

	/**
	 * Resolve an annotation
	 */
	async resolve(annotationId: string): Promise<void> {
		const annotation = this.annotations.get(annotationId);
		if (!annotation) {
			throw new Error('Annotation not found');
		}

		annotation.resolved = true;
		annotation.updatedAt = new Date();

		this.annotations.set(annotationId, annotation);
		this.emit('annotation_resolved', { annotationId });
	}

	/**
	 * Unresolve an annotation
	 */
	async unresolve(annotationId: string): Promise<void> {
		const annotation = this.annotations.get(annotationId);
		if (!annotation) {
			throw new Error('Annotation not found');
		}

		annotation.resolved = false;
		annotation.updatedAt = new Date();

		this.annotations.set(annotationId, annotation);
		this.emit('annotation_unresolved', { annotationId });
	}

	/**
	 * Get all annotations
	 */
	getAll(): Annotation[] {
		return Array.from(this.annotations.values());
	}

	/**
	 * Get annotations by node ID
	 */
	getByNode(nodeId: string): Annotation[] {
		return Array.from(this.annotations.values()).filter(
			(a) => a.nodeId === nodeId
		);
	}

	/**
	 * Get annotations by user ID
	 */
	getByUser(userId: string): Annotation[] {
		return Array.from(this.annotations.values()).filter(
			(a) => a.userId === userId
		);
	}

	/**
	 * Get unresolved annotations
	 */
	getUnresolved(): Annotation[] {
		return Array.from(this.annotations.values()).filter((a) => !a.resolved);
	}

	/**
	 * Get annotation by ID
	 */
	get(annotationId: string): Annotation | undefined {
		return this.annotations.get(annotationId);
	}

	/**
	 * Get annotations in area
	 */
	getInArea(topLeft: Position, bottomRight: Position): Annotation[] {
		return Array.from(this.annotations.values()).filter((a) => {
			return (
				a.position.x >= topLeft.x &&
				a.position.x <= bottomRight.x &&
				a.position.y >= topLeft.y &&
				a.position.y <= bottomRight.y
			);
		});
	}

	/**
	 * Clear all annotations
	 */
	clear(): void {
		this.annotations.clear();
		this.emit('annotations_cleared');
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.annotations.clear();
		this.removeAllListeners();
	}
}

/**
 * Create an annotation manager instance
 */
export function createAnnotationManager(options?: AnnotationManagerOptions): AnnotationManager {
	return new AnnotationManager(options);
}
