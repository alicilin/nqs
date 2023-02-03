import { bind } from '../ServiceDiscovery/Server.js';
import { SQLite } from '../stores.js';
//-------------------------------------
const port = 8080;
const store = SQLite({ filename: './sr.sqlite' });
await bind({ port, store, workers: 2, user: 'ali', password: 'veli'  });