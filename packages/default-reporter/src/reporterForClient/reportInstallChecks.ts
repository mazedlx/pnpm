import most = require('most')
import * as supi from 'supi'
import formatWarn from './utils/formatWarn'
import { autozoom } from './utils/zooming'

export default (
  installCheck$: most.Stream<supi.InstallCheckLog>,
  opts: {
    cwd: string,
  }
) => {
  return installCheck$
    .map(formatInstallCheck.bind(null, opts.cwd))
    .filter(Boolean)
    .map((msg) => ({ msg }))
    .map(most.of) as most.Stream<most.Stream<{msg: string}>>
}

function formatInstallCheck (
  currentPrefix: string,
  logObj: supi.InstallCheckLog,
  opts: {
    zoomOutCurrent: boolean,
  },
) {
  switch (logObj.code) {
    case 'EBADPLATFORM':
      return autozoom(
        currentPrefix,
        logObj['prefix'],
        formatWarn(`Unsupported system. Skipping dependency ${logObj.pkgId}`),
        opts,
      )
    case 'ENOTSUP':
      return autozoom(currentPrefix, logObj['prefix'], logObj.toString(), opts)
    default:
      return
  }
}
