'use strict';

/*
 * Admin account management (run on the server, never exposed over HTTP).
 *
 *   npm run create-admin              prompts for username + password
 *   npm run create-admin -- alice     prompts for alice's password (creates or resets)
 *   node server/cli.js list           lists admin usernames
 *
 * For scripted setups the password can be passed via the TSS_ADMIN_PASSWORD
 * environment variable instead of the prompt.
 */

const readline = require('readline');
const auth = require('./auth');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = function (s) {
        // echo the prompt itself, mask everything typed
        if (s.includes(question)) rl.output.write(s);
        else if (s !== '\r\n' && s !== '\n') rl.output.write('*');
      };
    }
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const [command = 'create', nameArg] = process.argv.slice(2);

  if (command === 'list') {
    const users = auth.readAccounts();
    if (!users.length) console.log('No admin accounts yet.');
    users.forEach((u) => console.log(`${u.username}  (password changed ${u.passwordChangedAt})`));
    return;
  }

  const username = (command === 'create' ? nameArg : command) || (await ask('Admin username: ')).trim();
  let password = process.env.TSS_ADMIN_PASSWORD;
  if (!password) {
    password = await ask(`Password for ${username} (min ${auth.MIN_PASSWORD} characters): `, { hidden: true });
    const repeat = await ask('Repeat password: ', { hidden: true });
    if (password !== repeat) throw new Error('Passwords do not match.');
  }
  const updated = auth.upsertAccount(username, password);
  console.log(updated ? `Password reset for "${username}".` : `Admin account "${username}" created.`);
  console.log('Sign in at /admin (restart is not required).');
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
