import {
  DataSource,
  DeepPartial,
  EntityTarget,
  FindManyOptions,
  FindOptionsWhere,
  ObjectLiteral,
  QueryFailedError,
  Repository,
} from 'typeorm';

export class BaseRepository<T extends ObjectLiteral> {
  protected readonly repo: Repository<T>;

  constructor(entity: EntityTarget<T>, dataSource: DataSource) {
    this.repo = dataSource.getRepository(entity);
  }

  findById(id: string, relations?: string[]): Promise<T | null> {
    return this.repo.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
      relations,
    });
  }

  findMany(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find(options);
  }

  save(entity: DeepPartial<T>): Promise<T> {
    return this.repo.save(entity);
  }

  async deleteById(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count({ where });
  }

  isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driver = error.driverError as { code?: string } | undefined;
    return driver?.code === '23505';
  }
}
