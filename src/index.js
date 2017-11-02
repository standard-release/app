/**
 * @copyright 2017-present, Charlike Mike Reagent <olsten.larck@gmail.com>
 * @license Apache-2.0
 */

const path = require('path')
const delay = require('delay')
const semver = require('semver')
const mustache = require('mustache')
const getConfig = require('./lib/config.js')
const utils = require('./lib/utils.js')

/**
 *
 * @param {*} robot
 */
module.exports = (robot) => {
  let releasePublished = false

  robot.on('push', async (context) => {
    if (releasePublished === true) return

    const config = await getConfig(context)
    const commit = detectChange(context, config)

    // Check if commit needs GitHub Release,
    // otherwise the bot should not do anything
    if (commit.increment) {
      const passed = []
      const pending = []

      releasePublished = release(context, config, { passed, pending })
    }
  })
}

/**
 *
 * @param {*} context
 * @param {*} config
 */
function detectChange (context, config) {
  const head = context.payload.head_commit
  const parts = /^(\w+)\((.+)\): (.+)/.exec(head.msg)
  const isBreaking = head.msg.includes('BREAKING CHANGE')

  const repository = context.payload.repository.full_name
  const link = `https://github.com/${repository}/commit/${head.id}`
  const type = parts[1]
  const lines = parts[3].split('\n')
  const commit = {
    type,
    scope: parts[2],
    subject: lines[0],
    body: lines.slice(1).join('\n'),
    anchor: `[${head.id.slice(0, 7)}](${link})`,
    head,
    link,
  }

  if (/break|breaking|major/.test(type) || isBreaking) {
    return Object.assign(commit, {
      increment: 'major',
      heading: config.majorHeading,
    })
  }
  if (/fix|bugfix|patch/.test(type)) {
    return Object.assign(commit, {
      increment: 'patch',
      heading: config.patchHeading,
    })
  }
  if (/feat|feature|minor/.test(type)) {
    return Object.assign(commit, {
      increment: 'minor',
      heading: config.minorHeading,
    })
  }

  return commit
}

/**
 *
 * @param {*} context
 * @param {*} config
 * @param {*} cache
 */
async function release (context, config, cache) {
  if (cache.passed.length && cache.passed.length === cache.pending.length) {
    return shouldRelease(context, config)
  }

  // Especially in CircleCI builds are pretty fast
  // even with tons of deps.. but make sure your cache
  // is enabled (or correctly configured).
  // Example: if you all checks ends in 1min,
  // only 6 requests are made, so don't worry.
  // The 6req/min is pretty pretty low amount when you have 5000req/hour.
  await delay(5000) // todo

  const statuses = await context.github.repos.getStatuses(utils.getRepo(context))

  statuses.data.forEach((x) => {
    if (x.state === 'pending' && !cache.pending.includes(x.context)) {
      cache.pending.push(x.context)
    }
    if (x.state === 'success' && !cache.passed.includes(x.context)) {
      cache.passed.push(x.context)
    }
  })

  return release(context, config, cache)
}

/**
 *
 * @param {*} context
 * @param {*} config
 */
async function shouldRelease (context, config) {
  const commit = detectChange(context, config)

  if (!commit.increment) {
    return false
  }

  return createRelease(context, config, commit)
}

/**
 *
 * @param {*} context
 * @param {*} config
 * @param {*} commit
 */
async function createRelease (context, config, commit) {
  const { currentVersion, nextVersion } = await getVersions(context, config, commit)
  const { owner, repo } = utils.getRepo(context)

  const options = {
    currentVersion,
    nextVersion,
    commit,
    owner,
    repo,
  }
  const body = await renderTemplate(context, config, options)

  const tagName = `v${nextVersion}`

  await context.github.repos.createRelease({
    owner,
    repo,
    body: body.trim(),
    tag_name: tagName,
    name: tagName,
    draft: false,
    prerelease: false,
  })

  return true
}

/**
 *
 * @param {*} context
 * @param {*} config
 * @param {*} commit
 */
async function getVersions (context, config, commit) {
  const repoCtx = utils.getRepo(context, { path: 'package.json' })
  const response = await context.github.repos.getContent(repoCtx)

  // parse package.json from the repo, to get the name
  const { name } = JSON.parse(utils.decodeBase64(response.data.content))

  const npmUrl = `${config.npmRegistry.replace(/\/$/, '')}/${name}`
  const pkgJson = JSON.parse(await utils.request(npmUrl))

  const currentVersion = pkgJson['dist-tags'].latest
  const nextVersion = semver.inc(currentVersion, commit.increment)

  return { currentVersion, nextVersion }
}

/**
 *
 * @param {*} context
 * @param {*} config
 * @param {*} opts
 */
async function renderTemplate (context, config, opts) {
  let template = config.releaseTemplate

  if (typeof config.templatePath === 'string') {
    const fp = path.resolve(config.templatePath)
    template = await utils.readFile(fp)
  }

  const repository = context.payload.repository.full_name
  const [date] = context.payload.head_commit.timestamp.split('T')
  const { currentVersion: prev, nextVersion: next } = opts
  const compareLink = `https://github.com/${repository}/compare/v${prev}}...v${next}}`

  const locals = Object.assign({}, config.locals, opts, {
    date,
    repository,
    compareLink,
  })

  return mustache.render(template, locals)
}
