<template>
	<div
		v-if="architectStore.isPanelOpen"
		:class="['workflow-architect-panel', { minimized: architectStore.isMinimized }]"
		data-test-id="workflow-architect-panel"
	>
		<!-- Header -->
		<div class="workflow-architect-header">
			<div class="workflow-architect-header__title">
				<i class="workflow-architect-header__icon">🤖</i>
				{{ $t('workflowArchitect.title') }}
			</div>
			<div class="workflow-architect-header__actions">
				<n8n-button
					v-if="architectStore.isProcessing"
					type="tertiary"
					size="mini"
					icon="stop"
					:title="$t('workflowArchitect.actions.abort')"
					@click="handleAbort"
				/>
				<n8n-button
					type="tertiary"
					size="mini"
					icon="redo"
					:title="$t('workflowArchitect.chat.newConversation')"
					@click="handleNewConversation"
				/>
				<n8n-button
					type="tertiary"
					size="mini"
					:icon="architectStore.isMinimized ? 'window-maximize' : 'window-minimize'"
					:title="
						architectStore.isMinimized
							? $t('workflowArchitect.panel.maximize')
							: $t('workflowArchitect.panel.minimize')
					"
					@click="handleToggleMinimize"
				/>
				<n8n-button
					type="tertiary"
					size="mini"
					icon="times"
					:title="$t('workflowArchitect.panel.close')"
					@click="handleClose"
				/>
			</div>
		</div>

		<!-- Status Bar -->
		<div v-if="architectStore.connectionError" class="workflow-architect-status workflow-architect-status--error">
			<i>⚠️</i>
			{{ architectStore.connectionError }}
		</div>

		<!-- Messages -->
		<div ref="messagesContainer" class="workflow-architect-messages">
			<!-- Welcome screen when no messages -->
			<div v-if="!architectStore.hasMessages" class="workflow-architect-welcome">
				<div class="workflow-architect-welcome__icon">🤖</div>
				<h3 class="workflow-architect-welcome__title">
					{{ $t('workflowArchitect.messages.welcomeTitle') }}
				</h3>
				<p class="workflow-architect-welcome__message">
					{{ $t('workflowArchitect.messages.welcomeMessage') }}
				</p>

				<!-- Example prompts -->
				<div class="workflow-architect-examples">
					<div class="workflow-architect-examples__title">
						{{ $t('workflowArchitect.chat.examplePrompts.title') }}
					</div>
					<div class="workflow-architect-examples__list">
						<div
							class="workflow-architect-examples__item"
							@click="handleExampleClick($t('workflowArchitect.chat.examplePrompts.slack'))"
						>
							{{ $t('workflowArchitect.chat.examplePrompts.slack') }}
						</div>
						<div
							class="workflow-architect-examples__item"
							@click="handleExampleClick($t('workflowArchitect.chat.examplePrompts.github'))"
						>
							{{ $t('workflowArchitect.chat.examplePrompts.github') }}
						</div>
						<div
							class="workflow-architect-examples__item"
							@click="handleExampleClick($t('workflowArchitect.chat.examplePrompts.webhook'))"
						>
							{{ $t('workflowArchitect.chat.examplePrompts.webhook') }}
						</div>
						<div
							class="workflow-architect-examples__item"
							@click="handleExampleClick($t('workflowArchitect.chat.examplePrompts.schedule'))"
						>
							{{ $t('workflowArchitect.chat.examplePrompts.schedule') }}
						</div>
					</div>
				</div>
			</div>

			<!-- Chat messages -->
			<div
				v-for="message in architectStore.messages"
				:key="message.id"
				:class="[
					'workflow-architect-message',
					`workflow-architect-message--${message.role}`,
				]"
			>
				<div class="workflow-architect-message__bubble">
					{{ message.content }}
				</div>

				<!-- Workflow preview -->
				<div
					v-if="message.workflow"
					class="workflow-architect-message__workflow-preview"
				>
					<div class="workflow-architect-message__workflow-preview__header">
						<span class="workflow-architect-message__workflow-preview__title">
							Workflow Generated
						</span>
					</div>
					<div class="workflow-architect-message__workflow-preview__info">
						{{ getWorkflowInfo(message.workflow) }}
					</div>
					<div class="workflow-architect-message__workflow-preview__actions">
						<n8n-button
							type="primary"
							size="small"
							:title="$t('workflowArchitect.tooltips.applyWorkflow')"
							@click="handleApplyWorkflow(message.workflow)"
						>
							{{ $t('workflowArchitect.actions.apply') }}
						</n8n-button>
						<n8n-button
							type="secondary"
							size="small"
							icon="copy"
							:title="$t('workflowArchitect.tooltips.copyWorkflow')"
							@click="handleCopyWorkflow(message.workflow)"
						>
							{{ $t('workflowArchitect.actions.copy') }}
						</n8n-button>
					</div>
				</div>

				<!-- Phases -->
				<div v-if="message.phases && message.phases.length > 0" class="workflow-architect-message__phases">
					<span
						v-for="(phase, idx) in message.phases"
						:key="idx"
						class="workflow-architect-message__phase"
					>
						{{ getPhaseLabel(phase) }}
					</span>
				</div>

				<div class="workflow-architect-message__timestamp">
					{{ formatTimestamp(message.timestamp) }}
				</div>
			</div>

			<!-- Processing indicator -->
			<div
				v-if="architectStore.isProcessing"
				class="workflow-architect-status workflow-architect-status--processing"
			>
				<i class="workflow-architect-status__icon">⏳</i>
				{{ getPhaseMessage(architectStore.currentPhase) }}
			</div>
		</div>

		<!-- Input -->
		<div class="workflow-architect-input">
			<div class="workflow-architect-input__wrapper">
				<textarea
					ref="inputField"
					v-model="inputMessage"
					class="workflow-architect-input__field"
					:placeholder="$t('workflowArchitect.chat.inputPlaceholder')"
					:disabled="!architectStore.canSendMessage"
					@keydown.enter.meta.prevent="handleSend"
					@keydown.enter.ctrl.prevent="handleSend"
					data-test-id="architect-input"
				/>
				<n8n-button
					type="primary"
					class="workflow-architect-input__send"
					:disabled="!canSend"
					:loading="architectStore.isProcessing"
					:title="$t('workflowArchitect.tooltips.sendMessage')"
					@click="handleSend"
					data-test-id="architect-send-button"
				>
					{{ $t('workflowArchitect.chat.send') }}
				</n8n-button>
			</div>
			<div class="workflow-architect-input__hint">
				{{ getShortcutString(ShortcutAction.SEND_MESSAGE) }} to send
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowArchitectStore, ProcessingPhase } from './architect.store';
import { useArchitectCanvas } from './useArchitectCanvas';
import { useArchitectShortcutsManual, ShortcutAction } from './useArchitectShortcuts';

// Props
interface Props {
	canvasOperations?: unknown;
}

const props = defineProps<Props>();

// Composables
const { t } = useI18n();
const architectStore = useWorkflowArchitectStore();
const architectCanvas = useArchitectCanvas(props.canvasOperations);
const { getShortcutString } = useArchitectShortcutsManual();

// Refs
const inputMessage = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const inputField = ref<HTMLTextAreaElement | null>(null);

// Computed
const canSend = computed(() => {
	return architectStore.canSendMessage && inputMessage.value.trim().length > 0;
});

// Methods
function handleSend() {
	if (!canSend.value) return;

	const message = inputMessage.value.trim();
	inputMessage.value = '';

	architectStore.sendMessage(message);
}

function handleAbort() {
	architectStore.abortRequest();
}

function handleClose() {
	architectStore.closePanel();
}

function handleToggleMinimize() {
	architectStore.toggleMinimize();
}

function handleNewConversation() {
	if (architectStore.isProcessing) {
		return;
	}
	architectStore.newConversation();
}

function handleExampleClick(example: string) {
	inputMessage.value = example;
	nextTick(() => {
		inputField.value?.focus();
	});
}

async function handleApplyWorkflow(workflow: unknown) {
	const result = await architectCanvas.applyWorkflow(workflow);

	if (result.success) {
		// Show success notification (in n8n, use the notification service)
		console.log('Workflow applied successfully');
	} else {
		// Show error notification
		console.error('Failed to apply workflow:', result.errors);
	}
}

async function handleCopyWorkflow(workflow: unknown) {
	try {
		const json = JSON.stringify(workflow, null, 2);
		await navigator.clipboard.writeText(json);
		// Show success notification
		console.log('Workflow copied to clipboard');
	} catch (error) {
		console.error('Failed to copy workflow:', error);
	}
}

function getWorkflowInfo(workflow: unknown): string {
	if (!workflow || typeof workflow !== 'object') {
		return 'Invalid workflow';
	}

	const w = workflow as { nodes?: unknown[] };
	const nodeCount = Array.isArray(w.nodes) ? w.nodes.length : 0;

	return `${nodeCount} node${nodeCount !== 1 ? 's' : ''}`;
}

function getPhaseLabel(phase: string): string {
	const phaseKey = phase.split(':')[0];
	return t(`workflowArchitect.phases.${phaseKey}`, phaseKey);
}

function getPhaseMessage(phase: ProcessingPhase): string {
	const messageKey = `status.${phase}`;
	return t(`workflowArchitect.${messageKey}`, phase);
}

function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;

	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `${diffHours}h ago`;

	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Auto-scroll to bottom when new messages arrive
watch(
	() => architectStore.messages.length,
	async () => {
		await nextTick();
		if (messagesContainer.value) {
			messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
		}
	},
);

// Custom event listeners for shortcuts
function handleSendMessageEvent() {
	if (canSend.value) {
		handleSend();
	}
}

function handleClearInputEvent() {
	inputMessage.value = '';
}

// Lifecycle
onMounted(() => {
	window.addEventListener('architect:sendMessage', handleSendMessageEvent);
	window.addEventListener('architect:clearInput', handleClearInputEvent);
});

onUnmounted(() => {
	window.removeEventListener('architect:sendMessage', handleSendMessageEvent);
	window.removeEventListener('architect:clearInput', handleClearInputEvent);
});
</script>

<style lang="scss" scoped>
@import './styles.scss';
</style>
