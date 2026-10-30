// Arc 1 Firebase: one Realtime Database connection and the room paths under it.
import '../../Config.js';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref } from 'firebase/database';

const App = initializeApp(globalThis.ArcConfig);
export const Database = getDatabase(App);

// rooms/<room>/<path>
export const Path = (Room, Name) => ref(Database, `rooms/${Room}/${Name}`);
