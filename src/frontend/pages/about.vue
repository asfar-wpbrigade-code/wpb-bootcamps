<script setup lang="ts">
const pageDescription = ref('Learn about WPBrigade\'s digital credentials platform and our mission.')

useSeoMeta({
  description: pageDescription.value,
  ogDescription: pageDescription.value,
  ogUrl: `${WEBSITE_URL}/about`
})

useHead({
  title: 'About',
  link: [
    { rel: 'canonical', href: `${WEBSITE_URL}/about` }
  ]
})
</script>

<template>
  <div class="min-h-screen">
    <!-- Project Section -->
    <section class="py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid md:grid-cols-2 gap-16 items-start">
          <!-- Left Column -->
          <div>
            <h1 class="text-4xl font-bold text-gray-900 mb-8">
              The Project
            </h1>
            <div class="space-y-6">
              <p class="text-lg text-gray-600 leading-relaxed">
                WPBrigade is a platform designed to make issuing and verifying digital credentials simple. By leveraging the Open Badges 3.0 standard, we ensure that every certificate issued through our platform is tamper-proof, verifiable, and accessible globally.
              </p>
              <p class="text-lg text-gray-600 leading-relaxed">
                Our mission is to provide a transparent, secure, and user-friendly solution for educational institutions, professional organizations, and businesses to issue and manage digital credentials that truly represent achievement and expertise in the digital age.
              </p>
            </div>
          </div>

          <!-- Right Column -->
          <div class="bg-gradient-to-br from-[#FFE5AE]/20 to-[#3458eb]/20 rounded-2xl p-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">
              Key Features
            </h2>
            <ul class="space-y-4">
              <li class="flex items-center gap-4">
                <div class="w-6 h-6 text-[#3458eb] i-lucide-check-circle flex-shrink-0" />
                <span class="text-lg text-gray-700">Easy-to-use interface</span>
              </li>
              <li class="flex items-center gap-4">
                <div class="w-6 h-6 text-[#3458eb] i-lucide-check-circle flex-shrink-0" />
                <span class="text-lg text-gray-700">Customizable templates</span>
              </li>
              <li class="flex items-center gap-4">
                <div class="w-6 h-6 text-[#3458eb] i-lucide-check-circle flex-shrink-0" />
                <span class="text-lg text-gray-700">Instant verification</span>
              </li>
              <li class="flex items-center gap-4">
                <div class="w-6 h-6 text-[#3458eb] i-lucide-check-circle flex-shrink-0" />
                <span class="text-lg text-gray-700">Secure, standards-based credentials</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-16 bg-gradient-to-b from-white to-[#FFE5AE]/20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl font-bold mb-6">
          Ready to get started?
        </h2>
        <p class="text-xl text-text-secondary max-w-2xl mx-auto mb-8">
          Start issuing and verifying digital credentials with WPBrigade today.
        </p>
        <div class="flex justify-center gap-4">
          <NuxtLink
            to="/get-started"
            class="py-3 px-6 rounded-full bg-[#3458eb] text-white hover:bg-[#3458eb]/90 transition-colors"
          >
            Get Started
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
