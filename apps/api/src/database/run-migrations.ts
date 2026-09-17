import 'reflect-metadata';
import '../load-env';
import { AppDataSource } from './data-source';

async function run() {
  const dataSource = AppDataSource.isInitialized
    ? AppDataSource
    : await AppDataSource.initialize();
  const ran = await dataSource.runMigrations();
  console.log(
    ran.length
      ? `Applied migrations: ${ran.map((m) => m.name).join(', ')}`
      : 'No pending migrations',
  );
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
