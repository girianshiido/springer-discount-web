import { Store } from './store.js';
import { Engine, makeFetcher } from '../collector/engine.js';
import { createApi } from './api.js';
if ((process.env.ADMIN_TOKEN?.length ?? 0)<32) throw new Error('Définir ADMIN_TOKEN avec au moins 32 caractères avant de démarrer.');
const store=new Store(process.env.DATA_DIR ?? './data');
const engine=new Engine(store,makeFetcher(process.env.COLLECTOR_USER_AGENT ?? 'SpringerDiscountFinder/0.1'),process.env.SPRINGER_COLLECTION_ENABLED==='true');
const server=createApi(engine,process.env.ADMIN_TOKEN ?? '',process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173');
server.listen(Number(process.env.PORT ?? 8787),'0.0.0.0',()=>console.log('API Springer prête'));
let stopping=false;
async function stop() {
  if (stopping) return; stopping=true;
  for (const j of store.state.jobs) if (j.status==='running') engine.pause(j.id);
  server.close(); await engine.waitIdle(); store.close();
}
process.on('SIGTERM',()=>void stop()); process.on('SIGINT',()=>void stop());
