const { parse } = require('parse-commit-message');
const detector = require('detect-next-version');
const getConfig = require('probot-config');

const render = require('./render');

const defaultConfig = {
  defaultBranch: 'master',
  interval: 30,
};

function isCI(val) {
  return (
    val.includes('continuous-integration') ||
    val.includes('circleci') ||
    val.includes('ci')
  );
}

async function delay(secs = 10000) {
  await new Promise((resolve) => setTimeout(resolve, secs * 1000));
}

module.exports = (robot) => {
  robot.on('push', async (context) => {
    const settingsConfig = await getConfig(context, 'new-release.yml');
    const config = Object.assign({}, defaultConfig, settingsConfig);

    if (context.payload.ref !== `refs/heads/${config.defaultBranch}`) {
      return;
    }

    const info = await getPkgMeta(context, robot);

    // If no need for bump, then exit.
    if (!info || (info && !info.increment)) {
      robot.log('No need for release publishing');
      return;
    }

    // pkgMeta is like `{ lastVersion, nextVersion, pkg, increment }`
    robot.log(info);

    // Delay for 10 seconds, then continue.
    // Creating release should not be instant, we should wait
    // until statuses/checks are ready first.
    await delay(10);

    const status = await ensureStatus(context, { info, config });

    // It's always a 'success' or `true`, if it is true,
    // then it already created the release from within `ensureStatus`,
    // Because there it checks recursively every 30 seconds, until success or failure.
    // If it is failure, it will throw, so we are safe.
    if (status === 'success') {
      robot.log(info);
      await createRelease(context, context.repo({ info }));
    }

    // And we are done.
  });
};

async function getPkgMeta(context, robot) {
  const pkg = await getPkg(context, robot);
  if (!pkg) return null;

  const result = await context.github.repos.getLatestRelease(context.repo());
  const { data: commits } = await context.github.repos.getCommits(
    context.repo({ since: result.data.created_at }),
  );

  // Do we need such thing as "commits since last tag"?
  const allCommitsSinceLastTag = commits.map((commit) => {
    robot.log(commit);
    robot.log('========================');
    const cmt = parse(commit.message);
    cmt.sha = commit.sha;
    cmt.author = context.payload.author;
    cmt.repository = context.payload.repository.full_name;
    return cmt;
  });

  // const endpoint = (name) => `https://registry.npmjs.org/${name}`;
  return detector(pkg.name, allCommitsSinceLastTag);
}

async function getPkg(context, robot) {
  let pkgData = null;

  try {
    pkgData = await context.github.repos.getContent(
      context.repo({
        ref: context.payload.ref,
        path: 'package.json',
      }),
    );
  } catch (err) {
    robot.log(err);
    return null;
  }
  // for ensurance, sometimes.. js can be bad boy.
  if (!pkgData) return null;

  let pkgJSON = null;

  try {
    pkgJSON = JSON.parse(Buffer.from(pkgData.data.content, 'base64'));
  } catch (err) {
    robot.log(err);
    return null;
  }

  return pkgJSON;
}

async function ensureStatus(context, { info, config }) {
  const status = await getStatus(context);
  if (status === null) {
    throw new Error('No CI is detected on that repository.');
  }

  if (status === 'success') {
    await createRelease(context, context.repo({ info }));
    return true;
  }
  if (status === 'failure') {
    throw new Error('The CI statuses are failing, not creating a release.');
  }

  await delay(config.interval);
  return ensureStatus(context, { info, config });
}

async function getStatus(context) {
  const { data } = await context.github.repos.getCombinedStatusForRef(
    context.repo({ ref: context.payload.ref }),
  );

  if (data.state === 'success') {
    return data.state;
  }

  // 1. data.state === pending and there is success CI, then we don't care
  // that there are pending statuses, we continue to release
  // 2. data.state === failure, then we check if CIs are okey,
  // if they are okey, then we don't care about the other failing statuses

  const states = {
    success: [],
    failure: [],
    pending: [],
  };

  data.statuses.forEach((status) => {
    if (isCI(status.context)) {
      states[status.state].push(status);
    }
  });

  if (states.success.length > 0) {
    return 'success';
  }
  if (states.failure.length > 0) {
    return 'failure';
  }
  if (states.pending.length > 0) {
    return 'pending';
  }
  return null;
}

async function createRelease(context, { owner, repo, info }) {
  const [date] = context.payload.head_commit.timestamp.split('T');
  const body = render(Object.assign({}, { owner, repo, date }, info));
  const tagName = `v${info.nextVersion}`;

  await context.github.repos.createRelease({
    owner,
    repo,
    body: body.trim(),
    tag_name: tagName,
    name: tagName,
    draft: false,
    prerelease: false,
  });
}
