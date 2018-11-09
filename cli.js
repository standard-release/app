#!/usr/bin/env node

'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const proc = require('process');

const ded = require('dedent');
const isCI = require('is-ci');
const parser = require('mri');
const { exec } = require('@tunnckocore/execa');

const release = require('./index');

const argv = parser(proc.argv.slice(2), {
  default: {
    cwd: proc.cwd(),
    ci: true,
  },
});

if (argv.ci && !isCI) {
  console.error('Publishing is only allowed on CI service!');
  console.error('Try passing --no-ci flag to bypass this, if you are sure.');
  proc.exit(1);
}

const writeFile = (fp, content) => util.promisify(fs.writeFile)(fp, content);

release(argv)
  .then(async (result) => {
    if (!proc.env.NPM_TOKEN) {
      throw new Error('Expect NPM_TOKEN environment variable to be set.');
    }

    console.log(
      JSON.stringify(result, (x, v) =>
        typeof v === 'function' ? '[Function]' : v,
      ),
    );

    const defaultRegistry = 'https://registry.npmjs.org/';
    const registry = argv.registry || proc.env.NPM_REGISTRY || defaultRegistry;
    const content = ded`//registry.npmjs.org/:_authToken=${proc.env.NPM_TOKEN}
    sign-git-tag=false
    git-tag-version=false
    allow-same-version=false
    `;

    const opts = {
      cwd: argv.cwd,
      stdio: 'inherit',
    };

    await writeFile(path.join(argv.cwd, '.npmrc'), content);
    await exec(`npm version ${result.nextVersion}`, opts);
    await exec(`npm publish --registry ${registry}`, opts);

    console.log('Successfully published.');
    return true;
  })
  .catch((err) => {
    console.error(err.stack);
    proc.exit(1);
  });
