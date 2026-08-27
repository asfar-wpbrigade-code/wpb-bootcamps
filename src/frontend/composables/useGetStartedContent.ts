export interface ListContent {
  [key: string]: {
    text: string
    component: 'span' | 'code'
  }[]
}

export default () => {
  const title = 'How does it work?'
  const subtitle = 'Just few simple steps to start create certificates for your business'
  const steps = [
    'Strapi Admin User creates certificates',
    'Company Issuer sends certificates',
    'Recipients receive & share certificates'
  ]
  const listTitle = 'Get Started in 3 Steps'

  const list: ListContent = {
    1: [
      { text: 'Create your WPBrigade account:', component: 'span' },
      { text: 'Sign up and set up your organization in minutes — no installation required.', component: 'span' }
    ],
    2: [
      { text: 'Set up your workspace:', component: 'span' },
      { text: 'Invite your team, configure your achievements, and customize your certificate templates.', component: 'span' }
    ],
    3: [
      { text: 'Set up achievements and roles:', component: 'span' },
      { text: 'In the admin panel, create a new Achievement and assign roles for issuers. Create an Issuer account, then sign in on the frontend and start sending certificates.', component: 'span' }
    ]
  }

  return {
    list,
    listTitle,
    steps,
    subtitle,
    title,
  }
}
