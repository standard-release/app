/**
 * @copyright 2017-present, Charlike Mike Reagent <olsten.larck@gmail.com>
 * @license Apache-2.0
 */

const fs = require('fs');
const util = require('util');
const delay = require('delay');
const request = require('simple-get');
const semver = require('semver');
const dedent = require('dedent');

function encodeBase64 (string) {
  return Buffer.from(string, 'utf8').toString('base64');
}
function decodeBase64 (base64) {
  return Buffer.from(base64, 'base64').toString('utf8');
}

const requestConcat = (...args) =>
  new Promise((resolve, reject) => {
    request.concat(...args, (er, _, data) => {
      if (er) return reject(er);
      return resolve(data);
    });
  });

const readFile = (fp) => util.promisify(fs.readFile)(fp, 'utf8');
const writeFile = util.promisify(fs.writeFile);

module.exports = (robot) => {
  const app = robot.route('/probot-test-app');

  app.get('/hi', async (req, res) => {
    res.end('Hello World!');
  });

  app.get('/auth/:username/:password/:token', async (req, res) => {
    const hash = encodeBase64(`${req.params.username}:${req.params.password}`);

    const opts = {
      method: 'POST',
      url: 'https://registry.npmjs.org/-/npm/v1/tokens',
      body: {
        password: req.params.password,
        readonly: false,
      },
      headers: {
        authorization: `Basic ${hash}`,
      },
      json: true,
    };

    const data = await requestConcat(opts);

    await writeFile(
      './__temp-storage.json',
      JSON.stringify({
        token: data.token,
        base64: hash,
        basic: `Basic ${hash}`,
        username: req.params.username,
        password: req.params.password,
      })
    );

    res.send('Done! :)');
  });

  let releasePublished = false;

  robot.on('push', async ({ github, payload }) => {
    if (releasePublished) return;
    const { repository, head_commit } = payload;
    const [owner, repo] = repository.full_name.split('/');
    const ref = head_commit.id;

    const passed = [];
    const pending = [];

    recursion({ owner, repo, ref });

    /**
     * Only continue forward if all status checks are green
     *
     * @param {*} obj
     */
    async function recursion (obj) {
      if (passed.length && passed.length === pending.length) {
        check();
        return;
      }

      // Especially in CircleCI builds are pretty fast
      // even with tons of deps.. but make sure your cache
      // is enabled (or correctly configured).
      // Example: if you all checks ends in 1min,
      // only 6 requests are made, so don't worry.
      // The 6req/min is pretty pretty low amount when you have 5000req/hour.
      await delay(5000);

      const { data, meta } = await github.repos.getStatuses(obj);

      console.log('DEBUG:', meta);

      data.forEach((x) => {
        if (x.state === 'pending' && !pending.includes(x.context)) {
          pending.push(x.context);
        }
        if (x.state === 'success' && !passed.includes(x.context)) {
          passed.push(x.context);
        }
      });

      recursion(obj);
    }

    /**
     * Checking and detecting if new version publish is needed
     */
    async function check () {
      // console.log('DEBUG: detection start');
      const parts = /^(\w+)\((.+)\): (.+)/.exec(head_commit.message);
      const isBreaking = head_commit.message.includes('BREAKING CHANGE');
      const commit = { scope: parts[2], body: parts[3] };
      let heading = null;

      if (/break|breaking|major/.test(parts[1]) || isBreaking) {
        heading = ':scream: BREAKING CHANGES :bangbang:';
        return bump('major', heading, commit);
      }
      if (/fix|bugfix|patch/.test(parts[1])) {
        heading = ':bug: Bug Fixes';
        return bump('patch', heading, commit);
      }
      if (/feat|feature|minor/.test(parts[1])) {
        heading = ':tada: New Features';
        return bump('minor', heading, commit);
      }
    }

    /**
     * Gather current package.json & versions,
     * git tag and publish new version.
     *
     * @param {*} inc
     */

    async function bump (incrementType, headingName, commit) {
      const { data } = await github.repos.getContent({
        owner,
        repo,
        ref,
        path: 'package.json',
      });

      const { name } = JSON.parse(decodeBase64(data.content));

      const URL_NPM = `https://registry.npmjs.org/${name}`;
      const PKGJSON = JSON.parse(await requestConcat(URL_NPM));

      const currentVersion = PKGJSON['dist-tags'].latest;
      const nextVersion = semver.inc(currentVersion, incrementType);

      const tagName = `v${nextVersion}`;
      const [date] = payload.head_commit.timestamp.split('T');
      const releaseBody = dedent`## [${nextVersion}](https://github.com/${payload
        .repository.full_name}/compare/v${currentVersion}...v${nextVersion}) (${date})

      ### ${headingName}

      - ${commit.scope !== '*' ? `**${commit.scope}:** ` : ''}${commit.body}
      `;

      releasePublished = await github.repos.createRelease({
        owner,
        repo,
        tag_name: tagName,
        name: tagName,
        body: releaseBody.trim(),
        draft: false,
        prerelease: false,
      });

      await writeFile(`./__${name}-package.json`, JSON.stringify(PKGJSON));

      // from here we should trigger Circle/Travis CI build, programmatically
      // which will expose special ENVs.
      console.log('service job is done!!!', tagName, headingName);
    }
  });
};
