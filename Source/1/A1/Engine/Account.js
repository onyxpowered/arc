// Arc 1 Account: email + password, then the verification link Firebase emails. Rules only admit verified accounts.
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { Auth } from './Firebase.js';

const Ask = async (Question, Secret) => {
  const Line = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (Secret) spawnSync('stty', ['-echo'], { stdio: 'inherit' });
  const Answer = await Line.question(Question);
  if (Secret) { spawnSync('stty', ['echo'], { stdio: 'inherit' }); console.log(); }
  Line.close();
  return Answer.trim();
};

async function SignIn() {
  if (!process.stdin.isTTY) { console.error('Not signed in. Run Start.command from a terminal once to sign in.'); process.exit(1); }
  for (;;) {
    const Email = await Ask('Arc 1 email: '), Password = await Ask('Password: ', true);
    try { return (await signInWithEmailAndPassword(Auth, Email, Password)).user; }
    catch (Error) {
      if (Error.code !== 'auth/invalid-credential') { console.log(Error.code || Error.message); continue; }
      if ((await Ask('No account for that, or wrong password. Create an account with this email? (y/N) ')).toLowerCase() !== 'y') continue;
      try { const { user } = await createUserWithEmailAndPassword(Auth, Email, Password); await sendEmailVerification(user); return user; }
      catch (Error_) { console.log(Error_.code === 'auth/email-already-in-use' ? 'That email already has an account, so the password was wrong.' : Error_.code || Error_.message); }
    }
  }
}

export async function Account() {
  await Auth.authStateReady();
  const User = Auth.currentUser || await SignIn();
  await User.reload();
  while (!User.emailVerified) {
    const Answer = await Ask(`Open the verification link we emailed to ${User.email}, then press Enter (r = send again): `);
    if (Answer === 'r') await sendEmailVerification(User);
    await User.reload();
  }
  await User.getIdToken(true);
  console.log('Signed in as', User.email);
  return User;
}
