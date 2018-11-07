'use strict';

module.exports = function render(locals) {
  const tpl = [];
  const { owner, repo, lastVersion: from, nextVersion: to } = locals;

  const repository = `${owner}/${repo}`;
  /* eslint-disable no-param-reassign */
  locals.link = `https://github.com/${repository}/compare/v${from}..v${to}`;

  tpl.push(`## [v${to}](${locals.link}) (${locals.date})`, '');

  ['major', 'minor', 'patch'].forEach((type) => {
    if (locals[type]) {
      let heading = null;

      if (locals.major) {
        heading = '### :exclamation: BREAKING CHANGES! :scream:';
      }
      if (locals.minor) {
        heading = '### :tada: New Features';
      }
      if (locals.patch) {
        heading = '### :bug: Bug Fixes';
      }

      tpl.push(heading, '');

      locals[type].forEach((commit) => {
        const profile = (commit.author && commit.author.login) || '';
        let hash = commit.sha ? commit.sha.slice(0, 7) : null;
        hash = hash ? `(#${hash}) ` : '';

        tpl.push(`- ${commit.header.toString()} ${hash}${profile}`);
      });

      const excludeSignOff = (zz) => {
        const val = zz
          .split('\n')
          .filter((x) => !x.startsWith('Signed-off-by'));
        return val;
      };

      locals[type].forEach((commit) => {
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

      tpl.push('', '');
    }
  });

  const link = `[\`v${locals.from}...v${locals.to}\`](${locals.compareLink})`;

  return tpl
    .concat('', link)
    .filter((x) => x !== null && x !== ' ')
    .join('\n')
    .trim();
};
