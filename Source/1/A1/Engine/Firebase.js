// Arc 1 Firebase: the Firebase project this computer uses. It is chosen at runtime (Connect), never baked into the app.
import '../../Config.js';
import { initializeApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
import { getDatabase, ref } from 'firebase/database';
import { Persistence } from './Persistence.js';

export const Link = { App: null, Auth: null, Database: null, Config: null };

export function Connect(Config) {
  Link.Config = Config;
  Link.App = initializeApp(Config);
  Link.Auth = initializeAuth(Link.App, { persistence: Persistence });
  Link.Database = getDatabase(Link.App);
}

// rooms/<uid>/<device>/<path>
export const Path = (Room, Name) => ref(Link.Database, `rooms/${Room}/${Name}`);
