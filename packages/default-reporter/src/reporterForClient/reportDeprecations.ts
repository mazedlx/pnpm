import chalk from 'chalk'
import most = require('most')
import * as supi from 'supi'
import formatWarn from './utils/formatWarn'
import { zoomOut } from './utils/zooming'

export default (
  deprecation$: most.Stream<supi.DeprecationLog>,
  opts: {
    cwd: string,
    isRecursive: boolean,
  }
) => {
  return deprecation$
    // print warnings only about deprecated packages from the root
    .filter((log) => log.depth === 0)
    .map((log) => {
      if (!opts.isRecursive && log.prefix === opts.cwd) {
        return {
          msg: formatWarn(`${chalk.red('deprecated')} ${log.pkgName}@${log.pkgVersion}: ${log.deprecated}`),
        }
      }
      return {
        msg: zoomOut(opts.cwd, log.prefix, formatWarn(`${chalk.red('deprecated')} ${log.pkgName}@${log.pkgVersion}`)),
      }
    })
    .map(most.of)
}
