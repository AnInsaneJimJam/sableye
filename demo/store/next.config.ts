import type { NextConfig } from 'next'

const config: NextConfig = {
  // The SDK's server package uses node:crypto / node:fs and must not be bundled for the browser.
  serverExternalPackages: ['@sableye/server'],
}
export default config
