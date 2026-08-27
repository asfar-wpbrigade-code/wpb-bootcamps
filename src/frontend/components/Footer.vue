<script setup lang="ts">
// No additional logic needed
</script>

<template>
  <footer class="w-full bg-gradient-to-b from-white to-[#FFE5AE]/20 pt-16 pb-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-8 mb-12">
        <!-- Logo Column -->
        <div class="md:col-span-2">
          <div class="flex items-center gap-3">
            <img src="/wpbrigade-logo.png" alt="WPBrigade logo" class="h-14 w-auto">
          </div>
          <span class="text-sm ml-2 text-text-secondary">Digital Credentials Platform</span>
          <p class="mt-4 text-text-secondary max-w-sm">
            Create, manage and issue digital certificates with ease.
          </p>
        </div>

        <!-- Quick Links -->
        <div class="space-y-4">
          <h3 class="font-bold text-lg">
            Quick Links
          </h3>
          <ul class="space-y-2">
            <li>
              <NuxtLink
                to="/"
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                Home
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/dashboard"
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                Dashboard
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/verify"
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                Verify Credentials
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/issue"
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                Issue Credentials
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/linkedin"
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                LinkedIn Guide
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Resources -->
        <div class="space-y-4">
          <h3 class="font-bold text-lg">
            Resources
          </h3>
          <ul class="space-y-2">
            <li>
              <NuxtLink
                to="/about"
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                About
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Contact -->
        <div class="space-y-4">
          <h3 class="font-bold text-lg">
            Contact
          </h3>
          <ul class="space-y-2">
            <li>
              <a
                href="mailto:info@autops.online"
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                info@autops.online
              </a>
            </li>
            <li>
              <a
                href="https://wpbrigade.com"
                target="_blank"
                rel="noopener noreferrer"
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                wpbrigade.com
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Copyright -->
      <div class="text-center text-text-secondary pt-8 border-t border-gray-200">
        <div class="flex flex-col md:flex-row justify-between items-center gap-4">
          <p>WPBrigade © {{ new Date().getFullYear() }}. All rights reserved.</p>
          <div class="flex space-x-6">
            <a
              href="/privacy-policy"
              class="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms-and-conditions"
              class="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Terms and Conditions
            </a>
            <a
              href="/linkedin"
              class="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              LinkedIn Guide
            </a>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>
