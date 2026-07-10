import type { ReportEditorial } from './types'

export const setupReports = [
  {
    id: 'setup-check',
    name: 'Doctor',
    category: 'setup',
    summary:
      'Find local setup problems before they turn into confusing empty reports or failed provider calls.',
    question: 'Is this machine ready to run reports for the selected project?',
    useWhen: [
      'Sign-in, project selection, or provider-backed reports are failing.',
      'A fresh installation needs a quick readiness check.',
    ],
    avoidWhen: [
      'You need to diagnose a page or search-performance change. Doctor checks the local installation, not the site.',
    ],
    evidence: [
      'Local configuration paths, OAuth client availability, saved sign-in state, granted scopes, and project defaults.',
    ],
    methodology: [
      'Runs independent checks and reports each result separately so one failed check does not hide the others.',
    ],
    exampleParams: {},
    interpretation: [
      'Fix failed checks from the top down. A missing OAuth client blocks sign-in, while a missing default only means you need to choose a property explicitly.',
    ],
    caveats: [
      'A clean local check does not prove that Google has data for a property or that a site has no SEO issues.',
    ],
    nextSteps: [
      'Run `seo start` if the installation still needs a project profile.',
      'Run the search performance overview after auth and project defaults pass.',
    ],
    related: ['search-performance-overview'],
    sources: [],
  },
] as const satisfies readonly ReportEditorial[]
