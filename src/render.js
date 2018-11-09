'use strict';

function excludeSignOff(zz) {
  return zz.split('\n').filter((x) => !x.startsWith('Signed-off-by:'));
}

function renderDataForType(commits, tpl) {
  commits.forEach((commit) => {
    let profile = '';
    if (commit.author && commit.author.login) {
      profile = ` @${commit.author.login}`;
    }

    const hash = commit.sha.slice(0, 7);
    const shaLink = hash ? ` ([#${hash}](${commit.html_url})) ` : '';

    const { scope, subject } = commit.header;
    const header = scope ? `**${scope}:** ${subject}` : subject;
    tpl.push(`- ${shaLink}${header}${profile}`);

    if (commit.body) {
      tpl.push('', excludeSignOff(commit.body));
    }
    if (commit.footer) {
      tpl.push('', excludeSignOff(commit.footer));
    }
    if (commit.mentions && commit.mentions.length > 0) {
      tpl.push('', commit.mentions.join(' '));
    }
  });
}

module.exports = function render(locals) {
  const tpl = [];
  const { owner, repo } = locals;
  const from = locals.lastVersion;
  const to = locals.nextVersion;

  const repository = `${owner}/${repo}`;
  const link = `https://github.com/${repository}/compare/v${from}..v${to}`;

  tpl.push(`# [v${to}](${link}) (${locals.date})`, '');

  let heading = null;

  if (locals.major) {
    heading = '## :exclamation: BREAKING CHANGES! :scream:';
    tpl.push(heading, '');
    renderDataForType(locals.major, tpl);
  }
  if (locals.minor) {
    heading = '## :tada: New Features';
    tpl.push(heading, '');
    renderDataForType(locals.minor, tpl);
  }
  if (locals.patch) {
    heading = '## :bug: Bug Fixes';
    tpl.push(heading, '');
    renderDataForType(locals.patch, tpl);
  }

  tpl.push('', '');

  return tpl
    .concat('', `[\`v${from}...v${to}\`](${link})`)
    .filter((x) => x !== null && x !== ' ')
    .join('\n')
    .trim();
};
