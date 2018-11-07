import path from 'path';
import proc from 'process';
import gitCommitsSince from 'git-commits-since';

export default async function release(options) {
  const opts = Object.assign({ cwd: proc.cwd() }, options);
  const { default: pkg } = await import(path.join(opts.cwd, 'package.json'));

  // const endpoint = (name) => `https://registry.npmjs.org/${name}`;

  return gitCommitsSince({ name: pkg.name, cwd: opts.cwd /* , endpoint */ });
}
