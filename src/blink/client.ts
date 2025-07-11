import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: 'image-compression-app-9bubqump',
  authRequired: true,
  timeout: 15000 // 15 seconds timeout
})