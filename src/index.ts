import assert = require('assert')
import {refToAbsolute, refToRelative} from 'dependency-path'
import {
  readPrivate,
  ResolvedPackages,
  Shrinkwrap,
} from 'pnpm-shrinkwrap'
import semver = require('semver')

export type PackageSelector = string | {
  name: string,
  range: string,
}

export interface PackageNode {
  pkg: {
    name: string,
    version: string,
    path: string,
  }
  dependencies?: PackageNode[],
  searched?: true,
  circular?: true,
}

export function forPackages(
  packages: PackageSelector[],
  projectPath: string,
  opts?: {
    depth: number,
    only?: 'dev' | 'prod',
  },
) {
  assert(packages, 'packages should be defined')
  if (!packages.length) return []

  return dependenciesHierarchy(projectPath, packages, opts)
}

export default function(
  projectPath: string,
  opts?: {
    depth: number,
    only?: 'dev' | 'prod',
  },
) {
  return dependenciesHierarchy(projectPath, [], opts)
}

async function dependenciesHierarchy(
  projectPath: string,
  searched: PackageSelector[],
  maybeOpts?: {
    depth: number,
    only?: 'dev' | 'prod',
  },
): Promise<PackageNode[]> {
  const opts = Object.assign({}, {
    depth: 0,
    only: undefined,
  }, maybeOpts)
  const shrinkwrap = await readPrivate(projectPath, {ignoreIncompatible: false})

  if (!shrinkwrap) return []

  const topDeps = getTopDependencies(shrinkwrap, opts)

  if (!topDeps) return []

  const getChildrenTree = getTree.bind(null, {
    currentDepth: 1,
    maxDepth: opts.depth,
    prod: opts.only === 'prod',
    registry: shrinkwrap.registry,
    searched,
  }, shrinkwrap.packages)
  const result: PackageNode[] = []
  Object.keys(topDeps).forEach((depName) => {
    const relativeId = refToRelative(topDeps[depName], depName)
    const pkgPath = refToAbsolute(topDeps[depName], depName, shrinkwrap.registry)
    const pkg = {
      name: depName,
      path: pkgPath,
      version: topDeps[depName],
    }
    const dependencies = getChildrenTree([relativeId], relativeId)
    let newEntry: PackageNode | null = null
    const matchedSearched = searched.length && matches(searched, pkg)
    if (dependencies.length) {
      newEntry = {
        dependencies,
        pkg,
      }
    } else if (!searched.length || matches(searched, pkg)) {
      newEntry = {pkg}
    }
    if (newEntry) {
      if (matchedSearched) {
        newEntry.searched = true
      }
      result.push(newEntry)
    }
  })
  return result
}

function getTopDependencies(
  shrinkwrap: Shrinkwrap,
  opts: {
    only?: 'dev' | 'prod',
  },
) {
  switch (opts.only) {
    case 'prod':
      return shrinkwrap.dependencies
    case 'dev':
      return shrinkwrap.devDependencies
    default:
      return Object.assign({},
        shrinkwrap.dependencies,
        shrinkwrap.devDependencies,
        shrinkwrap.optionalDependencies,
      )
  }
}

function getTree(
  opts: {
    currentDepth: number,
    maxDepth: number,
    prod: boolean,
    searched: PackageSelector[],
    registry: string,
  },
  packages: ResolvedPackages,
  keypath: string[],
  parentId: string,
): PackageNode[] {
  if (opts.currentDepth > opts.maxDepth || !packages || !packages[parentId]) return []

  const deps = opts.prod
    ? packages[parentId].dependencies
    : Object.assign({},
      packages[parentId].dependencies,
      packages[parentId].optionalDependencies,
    )

  if (!deps) return []

  const getChildrenTree = getTree.bind(null, Object.assign({}, opts, {
    currentDepth: opts.currentDepth + 1,
  }), packages)

  const result: PackageNode[] = []
  Object.keys(deps).forEach((depName) => {
    const pkgPath = refToAbsolute(deps[depName], depName, opts.registry)
    const relativeId = refToRelative(deps[depName], depName)
    const pkg = {
      name: depName,
      path: pkgPath,
      version: deps[depName],
    }
    const circular = keypath.indexOf(relativeId) !== -1
    const dependencies = circular ? [] : getChildrenTree(keypath.concat([relativeId]), relativeId)
    let newEntry: PackageNode | null = null
    const matchedSearched = opts.searched.length && matches(opts.searched, pkg)
    if (dependencies.length) {
      newEntry = {
        dependencies,
        pkg,
      }
    } else if (!opts.searched.length || matchedSearched) {
      newEntry = {pkg}
    }
    if (newEntry) {
      if (circular) {
        newEntry.circular = true
      }
      if (matchedSearched) {
        newEntry.searched = true
      }
      result.push(newEntry)
    }
  })
  return result
}

function matches(
  searched: PackageSelector[],
  pkg: {name: string, version: string},
) {
  return searched.some((searchedPkg) => {
    if (typeof searchedPkg === 'string') {
      return pkg.name === searchedPkg
    }
    return searchedPkg.name === pkg.name &&
      semver.satisfies(pkg.version, searchedPkg.range)
  })
}