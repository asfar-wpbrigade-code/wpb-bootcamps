<script setup lang="ts">
const { t } = useI18n()
const { sections, features, registrationSteps } = useHomeContent()

// Dialled, not linked, so it is kept as digits-only for the tel: href and
// spaced separately for reading.
const CONSULTATION_PHONE = '+923030748828'
const CONSULTATION_PHONE_DISPLAY = '+92 303 0748828'
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
    <!-- Drifting colour behind the hero. Decorative, so it is hidden from
         assistive tech and cannot be clicked through to; the classes and the
         reduced-motion handling live in assets/css/main.css. -->
    <div aria-hidden="true" class="wpb-aurora h-[44rem]">
      <span class="wpb-blob wpb-blob-a" />
      <span class="wpb-blob wpb-blob-b" />
      <span class="wpb-blob wpb-blob-c" />
    </div>

    <div class="relative z-10 max-w-4xl mx-auto text-center mb-16 mt-16">
      <h1 class="wpb-rise wpb-d1 text-5xl md:text-7xl font-display font-bold mb-6">
        {{ t('home.heroTitle').split(t('home.heroHighlight'))[0] }}<span class="text-primary wpb-shimmer-text">{{ t('home.heroHighlight') }}</span>{{ t('home.heroTitle').split(t('home.heroHighlight'))[1] }}
      </h1>
      <p class="wpb-rise wpb-d2 text-text-secondary text-xl md:text-2xl mb-12 max-w-2xl mx-auto">
        {{ t('home.heroSubtitle') }}
      </p>
      <!-- Two audiences arrive here: students looking to join a bootcamp, and
           people holding a certificate who want it checked. One route each.
           The first is an in-page anchor rather than a link straight out to a
           registration form, because registering takes two links and sending
           someone to either one on its own would leave them half-applied. -->
      <div class="wpb-rise wpb-d3 flex flex-wrap items-center justify-center gap-4">
        <a
          href="#register"
          class="wpb-cta wpb-lift inline-flex items-center px-8 py-4 rounded-full bg-secondary text-text-primary hover:bg-opacity-90 transition-all text-lg font-medium"
        >
          {{ t('home.heroButton') }}
          <span class="wpb-arrow i-heroicons-arrow-right ml-2 w-5 h-5" />
        </a>
        <NuxtLink
          to="/verify"
          class="wpb-lift inline-flex items-center px-8 py-4 rounded-full border border-text-primary/20 text-text-primary hover:bg-text-primary/5 transition-all text-lg font-medium"
        >
          {{ t('home.heroSecondaryButton') }}
        </NuxtLink>
      </div>
    </div>

    <div class="wpb-fade wpb-d4 relative z-10 mb-16">
      <div class="absolute inset-0 bg-white/40 backdrop-blur-sm rounded-3xl border border-white/20 shadow-xl" />
      <div class="relative p-6 md:p-8 lg:p-12">
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <HomeCardFeature
            v-for="(feature, featureIndex) in features"
            :key="feature.title"
            :feature="feature"
            :class="`wpb-reveal wpb-d${featureIndex + 1}`"
          />
        </div>
      </div>
    </div>

    <div class="relative z-10 space-y-8">
      <HomeSection
        v-for="(section, sectionIndex) in sections"
        :key="section.id"
        class="wpb-reveal"
        :section="section"
        :reverse="sectionIndex % 2 === 0"
      />

      <!-- Registration. The two links are numbered steps rather than a choice:
           an application is only counted once it appears in both, so offering
           them as alternatives would quietly lose half the applicants.
           scroll-mt keeps the heading clear of the fixed header when the hero
           button jumps here. -->
      <div id="register" class="wpb-reveal scroll-mt-24 rounded-xl border border-gray-300/20 bg-white">
        <div class="p-6 md:p-8 lg:p-12">
          <span class="inline-flex mb-6 px-6 py-2 text-black rounded-full text-sm font-medium uppercase bg-secondary">
            {{ t('home.registerTitle') }}
          </span>
          <h2 class="text-4xl md:text-5xl font-bold mb-4 text-balance">
            {{ t('home.registerHeader') }}
          </h2>
          <p class="text-lg text-text-secondary mb-8 max-w-2xl">
            {{ t('home.registerSubtitle') }}
          </p>

          <ol class="space-y-4 mb-6">
            <li
              v-for="(step, index) in registrationSteps"
              :key="step.href"
              class="flex items-start gap-3"
            >
              <span class="shrink-0 size-7 rounded-full bg-secondary text-black text-sm font-bold inline-flex items-center justify-center">
                {{ index + 1 }}
              </span>
              <a
                :href="step.href"
                target="_blank"
                rel="noopener noreferrer"
                class="wpb-underline text-lg text-text-primary hover:text-primary inline-flex items-center gap-1"
              >
                {{ step.label }}
                <BaseIcon name="arrow-top-right-on-square" collection="heroicons" class="size-4" />
              </a>
            </li>
          </ol>

          <p class="text-text-secondary mb-8 font-medium">
            {{ t('home.registerBoth') }}
          </p>

          <div class="p-4 rounded-xl bg-[#F4F1FF] border border-primary/20">
            <div class="flex items-start gap-2">
              <BaseIcon name="phone" collection="heroicons" class="size-5 mt-1 shrink-0" />
              <p class="text-text-secondary">
                {{ t('home.registerConsult') }}
                <a
                  :href="`tel:${CONSULTATION_PHONE}`"
                  class="font-medium text-text-primary underline underline-offset-4 whitespace-nowrap"
                >{{ CONSULTATION_PHONE_DISPLAY }}</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
