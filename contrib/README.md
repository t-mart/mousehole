# Mousehole Community Contributions

This directory contains community-contributed supplemental functionality.

- [Homepage Integration](./homepage/)
  - Display network info, API status, and timing data
  - Custom widgets and API integration
---
### Updated all dependencies to their latest versions. 
### Main changes:

  - Upgraded 22 packages including Zod 3→4, React Query, Tailwind, Motion, and all ESLint tooling
  - Fixed ESLint config for react-hooks plugin v7 (flat config format breaking change)
  - Ran type checking and linting - both pass
  - No application code changes needed
  - updated to v2.1

  #### Breaking changes handled:
  - eslint-plugin-react-hooks v7 changed its export format - manually configured plugin instead of using preset
