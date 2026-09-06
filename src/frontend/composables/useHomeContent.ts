export interface Section {
  features: string[]
  header: string
  id: 'tracks' | 'eligibility' | 'commitment'
  title: string
  content?: {
    title: string
    features: string[]
  }
}

export interface CardFeature {
  description: string
  icon: string
  title: string
}

/**
 * One of the two places an applicant has to register.
 *
 * Modelled as ordered steps rather than alternatives because the programme
 * counts an application only when it appears in both - someone who follows
 * just one link has not applied. HomeSection renders them numbered for that
 * reason, and `home.registerBoth` says so in as many words.
 */
export interface RegistrationStep {
  href: string
  label: string
}

export default () => {
  const { t } = useI18n()

  const tracksSection: Section = {
    id: 'tracks',
    title: t('home.section1Title'),
    header: t('home.section1Header'),
    features: [
      t('home.section1Feature1'),
      t('home.section1Feature2'),
      t('home.section1Feature3'),
      t('home.section1Feature4'),
    ],
    content: {
      title: 'You finish with',
      features: [
        'A verifiable certificate',
        'Real project work',
        'Skills employers ask for',
      ],
    },
  }

  const eligibilitySection: Section = {
    id: 'eligibility',
    title: t('home.section2Title'),
    header: t('home.section2Header'),
    features: [
      t('home.section2Feature1'),
      t('home.section2Feature2'),
      t('home.section2Feature3'),
    ],
  }

  const commitmentSection: Section = {
    id: 'commitment',
    title: t('home.section3Title'),
    header: t('home.section3Header'),
    features: [
      t('home.section3Feature1'),
      t('home.section3Feature2'),
      t('home.section3Feature3'),
      t('home.section3Feature4'),
    ],
  }

  const sections: Section[] = [
    tracksSection,
    eligibilitySection,
    commitmentSection,
  ]

  const features: CardFeature[] = [
    {
      title: t('home.feature1Title'),
      description: t('home.feature1Desc'),
      icon: 'video-camera',
    },
    {
      title: t('home.feature2Title'),
      description: t('home.feature2Desc'),
      icon: 'wrench-screwdriver',
    },
    {
      title: t('home.feature3Title'),
      description: t('home.feature3Desc'),
      icon: 'user-group',
    },
  ]

  const registrationSteps: RegistrationStep[] = [
    {
      label: t('home.registerStep1'),
      href: 'https://wpbrigade.com/sialkot/#free-bootcamp',
    },
    {
      label: t('home.registerStep2'),
      href: 'https://forms.gle/hUiFxeAmHvwe2vTZ6',
    },
  ]

  return {
    features,
    registrationSteps,
    sections,
  }
}
