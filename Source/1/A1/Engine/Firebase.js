// Arc 1 Firebase: one Realtime Database connection and Auth session, and the room paths under them.
import '../../Config.js';
import { initializeApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
import { getDatabase, ref } from 'firebase/database';
import { Persistence } from './Persistence.js';

export const App = initializeApp(globalThis.ArcConfig);
export const Auth = initializeAuth(App, { persistence: Persistence });
export const Database = getDatabase(App);

// rooms/<uid>/<device>/<path>
export const Path = (Room, Name) => ref(Database, `rooms/${Room}/${Name}`);
