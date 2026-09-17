import { DatabaseModule } from './database/database.module';
import { AppModule } from './app.module';

describe('AppModule', () => {
  it('imports DatabaseModule so repositories can be injected', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    expect(imports).toContain(DatabaseModule);
  });
});
