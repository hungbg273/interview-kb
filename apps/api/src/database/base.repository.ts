import { currentAccount } from '../accounts/account-context';
import { AppError } from '../common/app-error';
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

  constructor(
    entity: EntityTarget<T>,
    dataSource: DataSource,
    protected readonly personal = false,
  ) {
    this.repo = dataSource.getRepository(entity);
  }

  findById(id: string, relations?: string[]): Promise<T | null> {
    return this.repo.findOne({
      where: this.ownedWhere({ id } as unknown as FindOptionsWhere<T>),
      relations,
    });
  }

  findMany(options?: FindManyOptions<T>): Promise<T[]> {
    const where = options?.where;
    return this.repo.find({
      ...options,
      where: Array.isArray(where)
        ? where.map((item) => this.ownedWhere(item))
        : this.ownedWhere(where),
    });
  }

  async save(entity: DeepPartial<T>): Promise<T> {
    if (this.personal) {
      const userId = currentAccount().id;
      const value = entity as ObjectLiteral;
      if (value.userId && value.userId !== userId) throw AppError.notFound();
      if (
        value.id &&
        !(await this.repo.exists({
          where: this.ownedWhere({
            id: value.id,
          } as unknown as FindOptionsWhere<T>),
        }))
      )
        throw AppError.notFound();
      Object.assign(entity, { userId });
    }
    return this.repo.save(entity);
  }

  async deleteById(id: string): Promise<void> {
    await this.repo.delete(
      this.ownedWhere({ id } as unknown as FindOptionsWhere<T>),
    );
  }

  count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count({ where: this.ownedWhere(where) });
  }

  protected ownedWhere(where?: FindOptionsWhere<T>): FindOptionsWhere<T> {
    return {
      ...where,
      ...(this.personal ? { userId: currentAccount().id } : {}),
    } as FindOptionsWhere<T>;
  }

  isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driver = error.driverError as { code?: string } | undefined;
    return driver?.code === '23505';
  }
}
