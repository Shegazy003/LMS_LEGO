// node:test reporter: on GitHub Actions, each failing test also becomes an
// error annotation (test name and the first lines of the reason), so the
// reason for a red step can be read on the pull request's checks without
// opening the log. Prints nothing elsewhere; the spec reporter does the rest.
import { relative } from 'node:path';

const escData = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export default async function* githubReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail' || process.env.GITHUB_ACTIONS !== 'true') continue;
    const { name, details, file, line } = event.data;
    if (details?.type === 'suite') continue; // its tests are reported one by one
    const error = details?.error?.cause ?? details?.error;
    const reason = String(error?.message ?? error ?? 'failed').split('\n').filter(Boolean).slice(0, 8).join('\n');
    const where = file ? `file=${escProp(relative(process.cwd(), file))},line=${line ?? 1},` : '';
    yield `::error ${where}title=${escProp(name)}::${escData(reason)}\n`;
  }
}
