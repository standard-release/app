'use strict';

function renderDataForType(commits, tpl) {
  commits.forEach((commit) => {
    const hash = commit.sha.slice(0, 10);
    const shaLink = `[[\`${hash}\`](${commit.html_url} "${
      commit.commit.message
    }")] - `;

    const { scope, subject } = commit.header;
    const header = scope ? `**${scope}:** ${subject}` : subject;

    const profile = `@${commit.author.login}`;
    const profiles =
      commit.mentions && commit.mentions.length > 0
        ? [profile].concat(commit.mentions).join(', ')
        : profile;

    tpl.push(`- ${shaLink}${header} (${profiles})`);
  });
}

export default function render(locals) {
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
}
