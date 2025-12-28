import { z } from 'zod';

// User status types
export const UserStatusSchema = z.enum(['online', 'away', 'busy', 'offline']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

// Participant schema
export const ParticipantSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(100),
	avatar: z.string().url().optional(),
	status: UserStatusSchema,
	customStatus: z.string().max(200).optional(),
	lastActiveAt: z.date(),
	joinedAt: z.date(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

// Position schema
export const PositionSchema = z.object({
	x: z.number(),
	y: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;

// Selection schema
export const SelectionSchema = z.object({
	nodeId: z.string().optional(),
	startPos: PositionSchema,
	endPos: PositionSchema,
});
export type Selection = z.infer<typeof SelectionSchema>;

// Cursor schema
export const CursorSchema = z.object({
	userId: z.string().uuid(),
	position: PositionSchema,
	selection: SelectionSchema.optional(),
	color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	timestamp: z.date(),
});
export type Cursor = z.infer<typeof CursorSchema>;

// Annotation schema
export const AnnotationSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	content: z.string().min(1).max(5000),
	position: PositionSchema,
	nodeId: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
	resolved: z.boolean().default(false),
	replies: z.array(z.lazy(() => AnnotationReplySchema)).default([]),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

export const AnnotationReplySchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	content: z.string().min(1).max(5000),
	createdAt: z.date(),
});
export type AnnotationReply = z.infer<typeof AnnotationReplySchema>;

// Message schema
export const MessageSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	content: z.string().min(1).max(10000),
	timestamp: z.date(),
	contextType: z.enum(['workflow', 'node', 'general']).optional(),
	contextId: z.string().optional(),
	attachments: z.array(z.object({
		id: z.string().uuid(),
		name: z.string(),
		url: z.string().url(),
		size: z.number(),
		mimeType: z.string(),
	})).default([]),
	mentions: z.array(z.string().uuid()).default([]),
	reactions: z.array(z.object({
		emoji: z.string(),
		userId: z.string().uuid(),
	})).default([]),
});
export type Message = z.infer<typeof MessageSchema>;

// Recording event schema
export const RecordingEventSchema = z.object({
	type: z.enum(['cursor', 'selection', 'action', 'audio', 'video']),
	timestamp: z.number(),
	data: z.record(z.unknown()),
});
export type RecordingEvent = z.infer<typeof RecordingEventSchema>;

// Recording schema
export const RecordingSchema = z.object({
	id: z.string().uuid(),
	startTime: z.date(),
	endTime: z.date().optional(),
	duration: z.number().optional(),
	events: z.array(RecordingEventSchema).default([]),
	participants: z.array(z.string().uuid()).default([]),
	audioUrl: z.string().url().optional(),
	videoUrl: z.string().url().optional(),
	metadata: z.record(z.unknown()).optional(),
});
export type Recording = z.infer<typeof RecordingSchema>;

// Thread schema
export const ThreadSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).max(200).optional(),
	contextType: z.enum(['workflow', 'node', 'annotation']),
	contextId: z.string(),
	messages: z.array(MessageSchema).default([]),
	participants: z.array(z.string().uuid()).default([]),
	resolved: z.boolean().default(false),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type Thread = z.infer<typeof ThreadSchema>;

// Poll option schema
export const PollOptionSchema = z.object({
	id: z.string().uuid(),
	text: z.string().min(1).max(200),
	votes: z.array(z.string().uuid()).default([]),
});
export type PollOption = z.infer<typeof PollOptionSchema>;

// Poll schema
export const PollSchema = z.object({
	id: z.string().uuid(),
	question: z.string().min(1).max(500),
	options: z.array(PollOptionSchema).min(2).max(10),
	createdBy: z.string().uuid(),
	createdAt: z.date(),
	closedAt: z.date().optional(),
	anonymous: z.boolean().default(false),
	allowMultiple: z.boolean().default(false),
});
export type Poll = z.infer<typeof PollSchema>;

// Voice channel schema
export const VoiceChannelSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(100),
	participants: z.array(z.object({
		userId: z.string().uuid(),
		muted: z.boolean(),
		speaking: z.boolean(),
	})).default([]),
	createdAt: z.date(),
});
export type VoiceChannel = z.infer<typeof VoiceChannelSchema>;

// Video room schema
export const VideoRoomSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(100),
	participants: z.array(z.object({
		userId: z.string().uuid(),
		cameraEnabled: z.boolean(),
		micEnabled: z.boolean(),
		screenSharing: z.boolean(),
	})).default([]),
	layout: z.enum(['grid', 'speaker', 'spotlight']).default('grid'),
	createdAt: z.date(),
});
export type VideoRoom = z.infer<typeof VideoRoomSchema>;

// Whiteboard element schema
export const WhiteboardElementSchema = z.object({
	id: z.string().uuid(),
	type: z.enum(['pen', 'rectangle', 'circle', 'line', 'text', 'arrow']),
	userId: z.string().uuid(),
	color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	strokeWidth: z.number().min(1).max(20),
	points: z.array(PositionSchema).optional(),
	position: PositionSchema.optional(),
	width: z.number().optional(),
	height: z.number().optional(),
	text: z.string().optional(),
	timestamp: z.date(),
});
export type WhiteboardElement = z.infer<typeof WhiteboardElementSchema>;

// Permission role schema
export const PermissionRoleSchema = z.enum(['owner', 'editor', 'viewer', 'commenter']);
export type PermissionRole = z.infer<typeof PermissionRoleSchema>;

// Resource permission schema
export const ResourcePermissionSchema = z.object({
	userId: z.string().uuid(),
	role: PermissionRoleSchema,
	canEdit: z.boolean(),
	canComment: z.boolean(),
	canShare: z.boolean(),
	canDelete: z.boolean(),
});
export type ResourcePermission = z.infer<typeof ResourcePermissionSchema>;

// Collaboration event schema
export const CollaborationEventSchema = z.object({
	type: z.enum([
		'user_joined',
		'user_left',
		'cursor_move',
		'selection_change',
		'message_sent',
		'annotation_added',
		'annotation_updated',
		'annotation_deleted',
		'reaction_added',
		'poll_created',
		'poll_voted',
		'thread_created',
		'thread_resolved',
		'recording_started',
		'recording_stopped',
	]),
	userId: z.string().uuid(),
	data: z.record(z.unknown()),
	timestamp: z.date(),
});
export type CollaborationEvent = z.infer<typeof CollaborationEventSchema>;

// WebSocket message schema
export const WebSocketMessageSchema = z.object({
	action: z.enum([
		'join',
		'leave',
		'cursor_update',
		'selection_update',
		'message',
		'annotation',
		'reaction',
		'poll',
		'presence_update',
	]),
	payload: z.record(z.unknown()),
});
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

// Integration types
export const IntegrationTypeSchema = z.enum(['slack', 'teams', 'webhook']);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const IntegrationConfigSchema = z.object({
	type: IntegrationTypeSchema,
	enabled: z.boolean(),
	webhookUrl: z.string().url().optional(),
	slackChannelId: z.string().optional(),
	teamsWebhookUrl: z.string().url().optional(),
	events: z.array(z.string()).default([]),
});
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

// Analytics types
export const CollaborationMetricsSchema = z.object({
	sessionId: z.string().uuid(),
	duration: z.number(),
	participantCount: z.number(),
	messageCount: z.number(),
	annotationCount: z.number(),
	cursorMoves: z.number(),
	voiceMinutes: z.number().optional(),
	videoMinutes: z.number().optional(),
	timestamp: z.date(),
});
export type CollaborationMetrics = z.infer<typeof CollaborationMetricsSchema>;

// Mobile notification schema
export const MobileNotificationSchema = z.object({
	userId: z.string().uuid(),
	type: z.enum(['message', 'mention', 'annotation', 'reaction']),
	title: z.string(),
	body: z.string(),
	data: z.record(z.unknown()).optional(),
	timestamp: z.date(),
});
export type MobileNotification = z.infer<typeof MobileNotificationSchema>;
