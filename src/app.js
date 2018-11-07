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

    const pkg = await getPkg(robot, context);
    if (!pkg) return;

    // Do we need such thing as "commits since last tag"?
    const commits = context.payload.commits.map((commit) => {
      const cmt = parse(commit.message);
      cmt.sha = commit.sha;
      cmt.author = context.payload.author;
      cmt.repository = context.payload.repository.full_name;
      return cmt;
    });

    const pkgMeta = detector(pkg.name, commits);

    // If no need for bump, then exit.
    if (!pkgMeta.increment) {
      robot.log('No need for release publishing');
      return;
    }

    // pkgMeta is like `{ lastVersion, nextVersion, pkg, increment }`
    robot.log(pkgMeta);

    // Delay for 10 seconds, then continue.
    // Creating release should not be instant, we should wait
    // until statuses/checks are ready first.
    await delay(10);

    let status = await getStatus(context);

    if (status === 'success') {
      await createRelease(
        context,
        context.repo({ ref: context.payload.head, pkgMeta }),
      );
    } else {
      // Recheck every 30 seconds.
      // CircleCI is pretty fast, but some builds may need more time.
      // That time is configurable through `delay` option in the app config.
      const interval = setInterval(async () => {
        status = await getStatus(context);

        if (status === 'success') {
          clearInterval(interval);
          await createRelease(
            context,
            context.repo({ ref: context.payload.head, pkgMeta }),
          );

          robot.log('Release created.');
        } else {
          robot.log(`Rechecking statuses after ${config.interval} seconds`);
        }
      }, config.interval * 1000);
    }

    // And we are done.
  });
};

async function getPkg(robot, context) {
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
    pkgJSON = JSON.parse(Buffer.from(pkgData.content, 'base64'));
  } catch (err) {
    robot.log(err);
    return null;
  }

  return pkgJSON;
}

async function getStatus(context) {
  const data = await context.github.repos.getCombinedStatusForRef(
    context.repo({ ref: context.payload.head }),
  );

  if (data.state === 'success') {
    return data.state;
  }

  // 1. data.state === pending and there is success CI, then we don't care
  // that there are pending statuses, we continue to release
  // 2. data.state === failure, then we check if CIs are okey,
  // if they are okey, then we don't care about the other failing statuses

  const ciSuccess = [];

  data.statuses.forEach((status) => {
    if (isCI(status.context) && status.state === 'success') {
      ciSuccess.push(status);
    }
  });

  return ciSuccess.length > 0 ? 'success' : 'pending';
}

async function createRelease(context, { owner, repo, pkgMeta }) {
  const [date] = context.payload.head_commit.timestamp.split('T');
  const body = render(Object.assign({}, { owner, repo, date }, pkgMeta));
  const tagName = `v${pkgMeta.nextVersion}`;

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
