import { SQLiteDatabase, Table } from '../index.js';

class Planets extends Table {
  name = this.Text;
  distance = this.Real;
  inhabited = this.Bool;
  meta = this.Json;
}

const main = async () => {
  const db = new SQLiteDatabase(':memory:');
  const client = db.getClient({ Planets });
  const schema = db.diff();
  await db.migrate(schema);

  try {
    await client.planets.insert({ name: 'Mars', distance: 227.9, inhabited: false, meta: { moons: 2 } });
    console.log('Insert ok');
    await client.planets.update({ set: { inhabited: true }, where: { name: 'Mars' } });
    console.log('Update ok');
    try {
      await client.planets.insert({ name: null });
    }
    catch (e) {
      console.log('Expected error:', e.message);
    }
    try {
      await client.planets.update({ set: { distance: 'far' }, where: { name: 'Mars' } });
    }
    catch (e) {
      console.log('Expected error:', e.message);
    }
  }
  finally {
    await db.close();
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
