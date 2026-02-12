<template>
	<Teleport to="body">
		<WorkflowArchitect v-if="isEnabled && isFeatureEnabled" :canvas-operations="canvasOperations" />
	</Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import WorkflowArchitect from './WorkflowArchitect.vue';
import { useWorkflowArchitectStore } from './architect.store';
import { useArchitectShortcuts } from './useArchitectShortcuts';
import { isAiArchitectEnabled } from './feature-flags';

// Props
interface Props {
	canvasOperations?: unknown;
	featureFlags?: {
		aiArchitectEnabled?: boolean;
	};
}

const props = defineProps<Props>();

// Composables
const architectStore = useWorkflowArchitectStore();

// Register keyboard shortcuts
useArchitectShortcuts();

// Computed
const isEnabled = computed(() => {
	return true; // Can be controlled by component prop
});

const isFeatureEnabled = computed(() => {
	return isAiArchitectEnabled(props.featureFlags);
});

// Lifecycle
onMounted(() => {
	// Initialize the store when the panel is mounted
	if (isFeatureEnabled.value) {
		architectStore.initialize();
	}
});
</script>

<style lang="scss" scoped>
/* Panel-specific styles if needed */
</style>
