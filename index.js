/**
 * @copyright 2017-present, Charlike Mike Reagent <olsten.larck@gmail.com>
 * @license Apache-2.0
 */

const fs = require('fs');
const util = require('util');
const path = require('path');
const delay = require('delay');
const simpleGet = require('simple-get');
const semver = require('semver');
const dedent = require('dedent');
const yaml = require('js-yaml');
const mustache = require('mustache');

const defaultConfig = {
  majorHeading: ':scream: BREAKING CHANGES :bangbang:',
  minorHeading: ':tada: New Features',
  patchHeading: ':bug: Bug Fixes',
  releaseTemplate: dedent`
  ## [{{nextVersion}}](https://github.com/{{repository}}/compare/v{{currentVersion}}...v{{nextVersion}}) ({{date}})

  ### {{commit.heading}}
  - {{#if commit.scope !== '*'}}**{{commit.scope}}:** {{/if}}{{commit.subject}} ({{commit.anchor}})

  {{#if commit.body.length > 0}}
    {{commit.body}}
  {{/if}}
  `,
};

/**
 * Helper utils
 */

function decodeBase64 (base64) {
  return Buffer.from(base64, 'base64').toString('utf8');
}

function readFile (fp) {
  return util.promisify(fs.readFile)(fp, 'utf8');
}

const request = (...args) =>
  new Promise((resolve, reject) => {
    simpleGet.concat(...args, (er, _, data) => {
      if (er) return reject(er);
      return resolve(data);
    });
  });

/**
 * Entry point
 */

module.exports = (robot) => {
  let releasePublished = false;

  robot.on('push', async (context) => {
    if (releasePublished === true) return;

    const config = await getConfig(context);
    const commit = detectChange(context, config);

    // Check if commit needs GitHub Release,
    // otherwise the bot should not do anything
    if (commit.increment) {
      const passed = [];
      const pending = [];

      releasePublished = release(context, config, { passed, pending });
    }
  });
};

async function getConfig (context) {
  const options = getRepo(context, { path: '.github/semantic-release.yml' });
  let response = null;
  let config = null;

  try {
    response = await context.github.repos.getContent(options);
    config = yaml.safeLoad(decodeBase64(response.data.content));
  } catch (err) {
    if (err.code !== 404) {
      throw err;
    }
  }

  return Object.assign({}, defaultConfig, config);
}

function getRepo (context, opts) {
  return Object.assign({}, context.repo(), opts, {
    ref: context.payload.head_commit.id,
  });
}

function detectChange (context, config) {
  const head = context.payload.head_commit;
  const parts = /^(\w+)\((.+)\): (.+)/.exec(head.msg);
  const isBreaking = head.msg.includes('BREAKING CHANGE');

  const repository = context.payload.repository.full_name;
  const link = `https://github.com/${repository}/commit/${head.id}`;
  const type = parts[1];
  const lines = parts[3].split('\n');
  const commit = {
    type,
    scope: parts[2],
    subject: lines[0],
    body: lines.slice(1).join('\n'),
    anchor: `[${head.id.slice(0, 7)}](${link})`,
    head,
    link,
  };

  if (/break|breaking|major/.test(type) || isBreaking) {
    return Object.assign(commit, {
      increment: 'major',
      heading: config.majorHeading,
    });
  }
  if (/fix|bugfix|patch/.test(type)) {
    return Object.assign(commit, {
      increment: 'patch',
      heading: config.patchHeading,
    });
  }
  if (/feat|feature|minor/.test(type)) {
    return Object.assign(commit, {
      increment: 'minor',
      heading: config.minorHeading,
    });
  }

  return commit;
}

async function release (context, config, { passed, pending }) {
  if (passed.length && passed.length === pending.length) {
    return shouldRelease(context, config);
  }

  // Especially in CircleCI builds are pretty fast
  // even with tons of deps.. but make sure your cache
  // is enabled (or correctly configured).
  // Example: if you all checks ends in 1min,
  // only 6 requests are made, so don't worry.
  // The 6req/min is pretty pretty low amount when you have 5000req/hour.
  await delay(5000);

  const statuses = await context.github.repos.getStatuses(getRepo(context));

  statuses.data.forEach((x) => {
    if (x.state === 'pending' && !pending.includes(x.context)) {
      pending.push(x.context);
    }
    if (x.state === 'success' && !passed.includes(x.context)) {
      passed.push(x.context);
    }
  });

  return release(context, config, { passed, pending });
}

async function shouldRelease (context, config) {
  const commit = detectChange(context, config);

  if (!commit.increment) {
    return false;
  }

  return createRelease(context, config, commit);
}

async function createRelease (context, config, commit) {
  const { currentVersion, nextVersion } = await getVersions(context, config, commit);
  const { owner, repo } = getRepo(context, { path: 'package.json' });

  const options = {
    currentVersion,
    nextVersion,
    commit,
    owner,
    repo,
  };
  const body = await renderTemplate(context, config, options);

  const tagName = `v${nextVersion}`;

  await context.github.repos.createRelease({
    owner,
    repo,
    body: body.trim(),
    tag_name: tagName,
    name: tagName,
    draft: false,
    prerelease: false,
  });

  return true;
}

async function getVersions (context, config, commit) {
  const repoCtx = getRepo(context, { path: 'package.json' });
  const response = await context.github.repos.getContent(repoCtx);

  // parse package.json from the repo, to get the name
  const { name } = JSON.parse(decodeBase64(response.data.content));

  const npmUrl = `${config.npmRegistry.replace(/\/$/, '')}/${name}`;
  const pkgJson = JSON.parse(await request(npmUrl));

  const currentVersion = pkgJson['dist-tags'].latest;
  const nextVersion = semver.inc(currentVersion, commit.increment);

  return { currentVersion, nextVersion };
}

async function renderTemplate (context, config, opts) {
  let template = config.releaseTemplate;

  if (typeof config.templatePath === 'string') {
    const fp = path.resolve(config.templatePath);
    template = await readFile(fp);
  }

  const repository = context.payload.repository.full_name;
  const [date] = context.payload.head_commit.timestamp.split('T');
  const locals = Object.assign({}, config.locals, opts, { date, repository });

  return mustache.render(template, locals);
}
