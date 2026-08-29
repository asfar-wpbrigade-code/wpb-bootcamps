<script setup lang="ts">
const pageDescription = ref('WPBrigade runs hands-on bootcamps in WordPress, web development and AI, each ending in a certificate anyone can verify.')

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
              About our bootcamps
            </h1>
            <div class="space-y-6">
              <p class="text-lg text-gray-600 leading-relaxed">
                WPBrigade has spent years building WordPress products and client work. The bootcamps pass that on: practical training in the things we do daily, run in cohorts and taught by the people doing the work.
              </p>
              <p class="text-lg text-gray-600 leading-relaxed">
                Finish a programme and you earn a certificate. Not a PDF that could have come from anywhere &mdash; a cryptographically signed record that follows Open Badges 3.0, an open standard. Anyone you send it to can confirm it is genuine without contacting us, and nobody can forge or quietly alter one.
              </p>
              <p class="text-lg text-gray-600 leading-relaxed">
                It stays valid whether or not you stay in touch with us, and it is yours to put on a CV, a LinkedIn profile, or anywhere else it helps.
              </p>
            </div>
          </div>

          <!-- Right Column -->
          <div class="bg-gradient-to-br from-[#FFE5AE]/20 to-[#3458eb]/20 rounded-2xl p-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">
              What a certificate gives you
            </h2>
            <ul class="space-y-4">
              <li class="flex items-center gap-4">
                <div class="w-6 h-6 text-[#3458eb] i-lucide-check-circle flex-shrink-0" />
                <span class="text-lg text-gray-700">Your name, the programme and the dates you attended</span>
              </li>
              <li class="flex items-center gap-4">
                <div class="w-6 h-6 text-[#3458eb] i-lucide-check-circle flex-shrink-0" />
                <span class="text-lg text-gray-700">A permanent link for your CV or LinkedIn</span>
              </li>
              <li class="flex items-center gap-4">
                <div class="w-6 h-6 text-[#3458eb] i-lucide-check-circle flex-shrink-0" />
                <span class="text-lg text-gray-700">A QR code that verifies it in seconds</span>
              </li>
              <li class="flex items-center gap-4">
                <div class="w-6 h-6 text-[#3458eb] i-lucide-check-circle flex-shrink-0" />
                <span class="text-lg text-gray-700">Cryptographic proof that it is genuine</span>
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
          Thinking about joining?
        </h2>
        <p class="text-xl text-text-secondary max-w-2xl mx-auto mb-8">
          Find out how the programmes run and what you need to complete one.
        </p>
        <div class="flex justify-center gap-4">
          <NuxtLink
            to="/get-started"
            class="py-3 px-6 rounded-full bg-[#3458eb] text-white hover:bg-[#3458eb]/90 transition-colors"
          >
            How it works
          </NuxtLink>
          <NuxtLink
            to="/verify"
            class="py-3 px-6 rounded-full border border-[#3458eb] text-[#3458eb] hover:bg-[#3458eb]/5 transition-colors"
          >
            Verify a certificate
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
