export interface ListContent {
  [key: string]: {
    text: string
    component: 'span' | 'code'
  }[]
}

/**
 * Copy for the "how it works" page.
 *
 * Written for someone thinking about joining a bootcamp, or holding a
 * certificate and wondering what it is. It previously addressed an
 * organisation installing the platform - create an account, invite your team,
 * configure Strapi - which is a different site's job.
 */
export default () => {
  const title = 'How it works'
  const subtitle = 'From joining a programme to a certificate you can show anyone'
  const steps = [
    'Join a programme',
    'Complete the work',
    'Earn your certificate',
  ]
  const listTitle = 'Three steps'

  const list: ListContent = {
    1: [
      { text: 'Join a programme:', component: 'span' },
      { text: 'Get in touch to find out which bootcamp fits and when the next cohort starts. Programmes run in cohorts, so there is a start date rather than a sign-up button.', component: 'span' },
    ],
    2: [
      { text: 'Complete the work:', component: 'span' },
      { text: 'Each programme sets out what you need to do to pass. Those criteria are printed on the certificate itself, so anyone reading it can see what it took to earn.', component: 'span' },
    ],
    3: [
      { text: 'Earn your certificate:', component: 'span' },
      { text: 'It arrives by email when you finish, with a link to view, download and share it. An account is created at the same time using that address, so you can sign in and find every certificate you hold in one place.', component: 'span' },
    ],
  }

  return {
    list,
    listTitle,
    steps,
    subtitle,
    title,
  }
}
