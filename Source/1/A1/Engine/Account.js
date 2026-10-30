// Arc 1 Account: email + password, then the verification link Firebase emails. Rules only admit verified accounts.
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import { Link } from './Firebase.js';

const Messages = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/invalid-email': 'That email does not look right.',
  'auth/too-many-requests': 'Too many tries. Wait a moment.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled in this Firebase project.',
  'auth/configuration-not-found': 'Authentication is not set up in this Firebase project.',
  'auth/network-request-failed': 'No connection to Firebase.',
};

export const Describe = Failure => Messages[Failure.code] || Failure.message;
export const Ready = () => Link.Auth.authStateReady();
export const Current = () => (Link.Auth ? Link.Auth.currentUser : null);
export const SignIn = async (Email, Password) => (await signInWithEmailAndPassword(Link.Auth, Email, Password)).user;
export async function SignUp(Email, Password) {
  const Made = await createUserWithEmailAndPassword(Link.Auth, Email, Password);
  await sendEmailVerification(Made.user);
  return Made.user;
}
export const Resend = () => sendEmailVerification(Link.Auth.currentUser);
export async function Refresh() {
  const User = Link.Auth.currentUser;
  if (!User) return null;
  await User.reload();
  if (User.emailVerified) await User.getIdToken(true);
  return User;
}
export const Leave = () => signOut(Link.Auth);
