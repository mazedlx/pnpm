import { PnpmConfigs } from '@pnpm/config'
import chalk from 'chalk'
import most = require('most')
import path = require('path')
import R = require('ramda')
import semver = require('semver')
import * as supi from 'supi'
import { EOL } from '../constants'
import {
  ADDED_CHAR,
  REMOVED_CHAR,
} from './outputConstants'
import getPkgsDiff, {
  PackageDiff,
  propertyByDependencyType,
} from './pkgsDiff'

export default (
  log$: {
    deprecation: most.Stream<supi.DeprecationLog>,
    summary: most.Stream<supi.SummaryLog>,
    root: most.Stream<supi.RootLog>,
    packageJson: most.Stream<supi.PackageJsonLog>,
  },
  opts: {
    cwd: string,
    pnpmConfigs?: PnpmConfigs,
  },
) => {
  const pkgsDiff$ = getPkgsDiff(log$, { prefix: opts.cwd })

  const summaryLog$ = log$.summary
    .take(1)

  return most.combine(
    (pkgsDiff) => {
      let msg = ''
      for (const depType of ['prod', 'optional', 'dev', 'nodeModulesOnly']) {
        const diffs = R.values(pkgsDiff[depType])
        if (diffs.length) {
          msg += EOL
          if (opts.pnpmConfigs && opts.pnpmConfigs.global) {
            msg += chalk.cyanBright(`${opts.cwd}:`)
          } else {
            msg += chalk.cyanBright(`${propertyByDependencyType[depType]}:`)
          }
          msg += EOL
          msg += printDiffs(diffs, { prefix: opts.cwd })
          msg += EOL
        }
      }
      return { msg }
    },
    pkgsDiff$,
    summaryLog$,
  )
  .take(1)
  .map(most.of)
}

function printDiffs (
  pkgsDiff: PackageDiff[],
  opts: {
    prefix: string,
  },
) {
  // Sorts by alphabet then by removed/added
  // + ava 0.10.0
  // - chalk 1.0.0
  // + chalk 2.0.0
  pkgsDiff.sort((a, b) => (a.name.localeCompare(b.name) * 10 + (Number(!b.added) - Number(!a.added))))
  const msg = pkgsDiff.map((pkg) => {
    let result = pkg.added
      ? ADDED_CHAR
      : REMOVED_CHAR
    if (!pkg.realName || pkg.name === pkg.realName) {
      result += ` ${pkg.name}`
    } else {
      result += ` ${pkg.name} <- ${pkg.realName}`
    }
    if (pkg.version) {
      result += ` ${chalk.grey(pkg.version)}`
      if (pkg.latest && semver.lt(pkg.version, pkg.latest)) {
        result += ` ${chalk.grey(`(${pkg.latest} is available)`)}`
      }
    }
    if (pkg.deprecated) {
      result += ` ${chalk.red('deprecated')}`
    }
    if (pkg.from) {
      result += ` ${chalk.grey(`<- ${pkg.from && path.relative(opts.prefix, pkg.from) || '???'}`)}`
    }
    return result
  }).join(EOL)
  return msg
}
