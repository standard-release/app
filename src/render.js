'use strict';

module.exports = function render(locals) {
  const tpl = [];
  const { owner, repo } = locals;
  const from = locals.lastVersion;
  const to = locals.nextVersion;

  const repository = `${owner}/${repo}`;
  const link = `https://github.com/${repository}/compare/v${from}..v${to}`;

  tpl.push(`# [v${to}](${link}) (${locals.date})`, '');

  ['major', 'minor', 'patch'].forEach((type) => {
    if (locals[type]) {
      let heading = null;

      if (locals.major) {
        heading = '## :exclamation: BREAKING CHANGES! :scream:';
        tpl.push(heading, '');
      }
      if (locals.minor) {
        heading = '## :tada: New Features';
        tpl.push(heading, '');
      }
      if (locals.patch) {
        heading = '## :bug: Bug Fixes';
        tpl.push(heading, '');
      }

      locals[type].forEach((commit) => {
        let profile = '';
        if (commit.author && commit.author.login) {
          profile = ` @${commit.author.login}`;
        }

        const hash = commit.tree ? commit.tree.sha.slice(0, 7) : null;
        const shaLink = hash ? ` ([#${hash}](${commit.tree.url})) ` : '';

        const { scope, subject } = commit.header;
        const header = scope ? `**${scope}:** ${subject}` : subject;
        tpl.push(`- ${header}${shaLink}${profile}`);
      });

      const excludeSignOff = (zz) => {
        const val = zz
          .split('\n')
          .filter((x) => !x.startsWith('Signed-off-by:'));
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

  return tpl
    .concat('', `[\`v${from}...v${to}\`](${link})`)
    .filter((x) => x !== null && x !== ' ')
    .join('\n')
    .trim();
};
