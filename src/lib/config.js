/**
 * @copyright 2017-present, Charlike Mike Reagent <olsten.larck@gmail.com>
 * @license Apache-2.0
 */

const dedent = require('dedent')
const yaml = require('js-yaml')
const utils = require('./utils.js')

const defaultConfig = {
  npmRegistry: 'https://registry.npmjs.org',
  majorHeading: ':scream: BREAKING CHANGES :bangbang:',
  minorHeading: ':tada: New Features',
  patchHeading: ':bug: Bug Fixes',
  releaseTemplate: dedent`
  ## [v{{nextVersion}}]({{compareLink}}) ({{date}})

  ### {{commit.heading}}
  - {{#if commit.scope !== '*'}}**{{commit.scope}}:** {{/if}}{{commit.subject}} ({{commit.anchor}})

  {{#if commit.body.length > 0}}
    {{commit.body}}
  {{/if}}
  `,
}

/**
 *
 * @param {*} context
 */
module.exports = async function getConfig (context) {
  const options = utils.getRepo(context, { path: '.github/semantic-release.yml' })
  let response = null
  let config = null

  try {
    response = await context.github.repos.getContent(options)
    config = yaml.safeLoad(utils.decodeBase64(response.data.content))
  } catch (err) {
    if (err.code !== 404) {
      throw err
    }
  }

  return Object.assign({}, defaultConfig, config)
}
