<script setup lang="ts">
import type { CardFeature } from '~/composables/useHomeContent'

defineProps<{
  feature: CardFeature
}>()
</script>

<template>
  <NCard
    :key="feature.title"
    class="wpb-lift group h-full hover:shadow-lg p-4 border border-gray-200 rounded-xl"
  >
    <div class="wpb-pop text-primary mb-4 size-8">
      <BaseIcon collection="heroicons" :name="feature.icon" class="size-full" />
    </div>
    <h3 class="text-xl font-bold mb-2">
      {{ feature.title }}
    </h3>
    <p class="text-text-secondary">
      {{ feature.description }}
    </p>
  </NCard>
</template>
